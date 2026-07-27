import * as vscode from 'vscode'
import { cfg } from '../global-config'
import { last } from 'lodash'
import { extractParams } from '../helpers/extract-params'
import { NodeTraverseError } from '../types'
import type { TFunctionInfo } from '@repo/types/framework.types'
import { inputKeypath, KeypathInputType, keypathQuickPick } from '../helpers/input-keypath'
import { aiClient } from '../api/ai-client'
import { handleAiApiError } from '../api/handle-ai-api-error'
import { reportEvent } from '../telemetry/telemetry'
import {
  getLimitedItemsCloseToPisition,
  getSurroundingCode,
  localizedTextDotJoined,
  sortLocalizedText,
} from '../helpers/helpers'
import { usageService } from '../helpers/usage-service'
import { saveWithDiffReview, type DiffEntries } from '../helpers/diff-review/save-with-diff-review'
import { pluralToResourceEntries } from '@repo/shared/core/plurals/serialize-plural'
import { getFrameworkOrCustom } from '@repo/shared/core/registry'
import type { PluralModel } from '@repo/types/plurals.types'
import type { Locale, LocalizedText } from '@repo/types/primitives.types'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import { ControlledQuickPicker, QuickPickConfig, QuickPickControls } from '../helpers/controlled-quick-picker'
import { getSrcLocaleWithSaveSuggestion } from '../helpers/input-src-locale'
import { resolveInsertContext } from '../helpers/resolve-insert-context'
import { resourceService } from '../helpers/resource-service'
import type { KeypathInfo } from '@repo/types/framework.types'
import { insertTFunction } from '../editor-integration/frameworks/insert-t-function'
import { getNodeAtCursor } from '../editor-integration/cursor-context/get-node-at-cursor'
import { parseParamNames } from '../helpers/parse-params'
import { AiResponse, TranslateSourceOutput } from '@repo/types/ai-action.types'
import { LucideIcon } from '../lucide-icons'
import { editWorkspaceAndSave } from '../helpers/workspace-edit'

interface KeypathExample {
  keypath: string
  lineIndex: number
}

export async function extractAndTranslateCmd() {
  reportEvent(TelemetryEvent.translate)

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    handleError({ snackbar: 'No active editor found', internal: 'extractAndTranslateCmd' })
    return
  }

  let srcLocale = (await getSrcLocaleWithSaveSuggestion()) as string
  if (!srcLocale) {
    return
  }

  const result = getNodeAtCursor()
  const node = result.node
  const text = node?.value

  if (!text) {
    switch (result.error) {
      case NodeTraverseError.NoActiveEditor:
        handleError({ snackbar: 'No active editor', internal: 'nodeExtraction' })
        break
      case NodeTraverseError.SelectManually:
        vscode.window.showWarningMessage('Please, select text range')
        break
      default:
        handleError({
          snackbar: 'Valid text range not found',
          internal: 'nodeExtraction',
        })
    }
    return
  }

  const ctx = await resolveInsertContext(editor)
  if (!ctx) {
    return
  }
  const { tFuncInfo, ns, view } = ctx
  const moduleName = view.name

  const srcText = extractParams(text, moduleName)

  const translateFn = async (): Promise<AiResponse<TranslateSourceOutput> | undefined> => {
    try {
      if (cfg.settings.createMessageFromSourceText.autoTranslate) {
        const surroundingCode = await getSurroundingCode(editor.document.uri, editor.selection.active.line)
        // Plural detection gated off until CLDR-vs-runtime category mismatch is resolved (see TODO.md).
        return await aiClient.translate(srcText, srcLocale, surroundingCode, moduleName, false)
      }
      return undefined
    } catch (error: any) {
      keypathQuickPick?.controls.dispose()
      handleAiApiError(error)
    }
  }

  let translationPromise: Promise<AiResponse<TranslateSourceOutput> | undefined> = Promise.resolve(undefined)
  const { reused, value: keypathValue } = await createOrReuseKeypath(
    srcText.value,
    ns,
    () => (translationPromise = translateFn()),
    tFuncInfo.tFunctionInfo,
    moduleName,
  )

  if (!keypathValue) {
    return
  }

  if (reused) {
    await editWorkspaceAndSave(async (workspaceEdit) => {
      await insertTFunction(
        workspaceEdit,
        {
          loc: node.loc,
          keypath: keypathValue,
          tFunctionInfo: tFuncInfo.tFunctionInfo,
          eraseQuotes: true,
          cleanSrcText: srcText.value,
          params: parseParamNames(
            Object.values(resourceService.getFlatTranslationsPerKeypath(ns, moduleName)[keypathValue]),
            moduleName,
          ),
        },
        editor.document.uri,
      )
    })
    return
  }

  const response = await waitResponseWithProgress(translationPromise)
  if (!response) {
    if (!cfg.settings.createMessageFromSourceText.autoTranslate) {
      let affectedResourceUris: vscode.Uri[] = []

      const success = await editWorkspaceAndSave(async (workspaceEdit) => {
        const translationFileUpdates = await resourceService.collectWorkspaceChangesForNewMessage(
          workspaceEdit,
          { [keypathValue]: { [srcLocale]: srcText.value } },
          ns,
          moduleName,
        )
        affectedResourceUris = translationFileUpdates.affectedUris

        await insertTFunction(
          workspaceEdit,
          {
            loc: node.loc,
            keypath: keypathValue,
            params: srcText.params,
            tFunctionInfo: tFuncInfo.tFunctionInfo,
            eraseQuotes: true,
            cleanSrcText: srcText.value,
          },
          editor.document.uri,
        )
      })

      if (success) {
        resourceService.handleFileUpdate(affectedResourceUris)
        vscode.window.showInformationMessage('New message created successfully')
      }
    }

    return
  }
  const output = response.result
  const messageFormat = view.messageFormat
  const pluralVar = getFrameworkOrCustom(view.module.framework).ideInsert?.pluralVar ?? 'count'
  // The count expr the AI detected is a placeholder NAME; resolve it to the real source expression
  // (`itemsLength` → `items.length`). Falls back to the name, then to the framework's plural var.
  const countExpr = output.countExpr ? (srcText.params[output.countExpr] ?? output.countExpr) : undefined

  const getFullLocalizedText = (localized: LocalizedText, srcTranslation: string) => ({
    ...localized,
    [srcLocale]: srcTranslation,
  })

  // The resource entries a variant will write: fanned-out plural keys, or a single flat keypath.
  const entriesFor = (variant: (typeof output.result)[number]): DiffEntries => {
    if (variant.isPlural && variant.plurals) {
      const perLocaleModel: Record<string, PluralModel> = Object.fromEntries(
        Object.entries(variant.plurals).map(([locale, branches]) => [
          locale,
          { numberType: 'cardinal', countVar: pluralVar, branches },
        ]),
      )
      return pluralToResourceEntries(keypathValue, perLocaleModel, messageFormat)
    }
    return { [keypathValue]: sortLocalizedText(getFullLocalizedText(variant.translations ?? {}, variant.srcText)) }
  }

  // A blank original mirroring each keypath's own locales — everything here is a brand-new message.
  const blankLike = (entries: DiffEntries): DiffEntries =>
    Object.fromEntries(
      Object.entries(entries).map(([kp, locales]) => [
        kp,
        Object.fromEntries(Object.keys(locales).map((l) => [l, ''])),
      ]),
    )

  saveWithDiffReview(
    output.result.map((variant, index) => {
      const description = !variant.description && index === 0 ? '' : variant.description
      const entries = entriesFor(variant)
      const count = variant.isPlural ? { var: pluralVar, expr: countExpr } : undefined
      // A plural's only interpolation is the count (passed via `count`). Drop the extracted params —
      // they're artifacts of the manual-plural source being replaced (e.g. a `n !== 1 ? 's' : ''` ternary).
      const insertParams = variant.isPlural ? undefined : srcText.params

      return {
        originalObject: blankLike(entries),
        updatedObject: entries,
        overrideResolutions: variant.overrideResolutions,
        saveCallback: async (finalResult) => {
          let affectedResourceUris: vscode.Uri[] = []

          const success = await editWorkspaceAndSave(async (workspaceEdit) => {
            const translationFileUpdates = await resourceService.collectWorkspaceChangesForNewMessage(
              workspaceEdit,
              finalResult,
              ns,
              moduleName,
            )
            affectedResourceUris = translationFileUpdates.affectedUris

            await insertTFunction(
              workspaceEdit,
              {
                loc: node.loc,
                keypath: keypathValue,
                params: insertParams,
                count,
                tFunctionInfo: tFuncInfo.tFunctionInfo,
                eraseQuotes: true,
                cleanSrcText: srcText.value,
              },
              editor.document.uri,
            )
          })

          if (!success) {
            handleError({
              snackbar: 'Failed to create new message',
              internal: 'extractAndTranslateCmd: saving new message failed',
            })
            return
          }

          resourceService.handleFileUpdate(affectedResourceUris)
          vscode.window.showInformationMessage('New message created successfully')
        },
        options: {
          title: index === 0 ? 'Direct translation' : 'Alternative',
          description,
          saveBtn: 'Apply',
        },
      }
    }),
    {
      usageContext: output.usageContext,
    },
  )
}

enum CreateOrReuseStep {
  Start = 'start',
}

async function createOrReuseKeypath(
  extractedText: string,
  namespace: string,
  startTranslationFn: () => void,
  tFuncInfo: TFunctionInfo,
  moduleName?: string,
): Promise<{ reused: boolean; value: string | null }> {
  const editor = vscode.window.activeTextEditor!
  const selection = editor.selection

  // init value based on existing keypaths in curr file
  let initKeypathValue = ''
  const keypathsInCurrentFile = usageService.perFile.get(editor.document.uri.toString()) ?? []
  const staticKeypathsInCurrentFile = keypathsInCurrentFile.filter((keypath) => keypath.type === 'static')
  let examples: KeypathExample[] = []
  for (const currentFileKeypath of staticKeypathsInCurrentFile) {
    const exampleKeypath = currentFileKeypath.keypaths[0] ?? currentFileKeypath.content
    examples.push({ keypath: exampleKeypath, lineIndex: currentFileKeypath.loc.line })
  }
  const currentLine = selection.anchor.line
  const neighbourAbove = last(examples.filter((e) => e.lineIndex < currentLine))?.keypath.split('.')
  const neighbourBelow = examples.filter((e) => e.lineIndex > currentLine)[0]?.keypath.split('.')
  if (neighbourAbove && neighbourAbove.length > 1) {
    initKeypathValue = neighbourAbove.slice(0, -1).join('.') + '.'
  } else if (neighbourBelow && neighbourBelow.length > 1) {
    initKeypathValue = neighbourBelow.slice(0, -1).join('.') + '.'
  }

  const exactMatchKeypaths = getExactMatchKeypaths(extractedText, undefined, undefined, namespace, moduleName)
  if (!exactMatchKeypaths.length) {
    startTranslationFn()
    if (cfg.settings.createMessageFromSourceText.suggestKeypath) {
      const value = await inputKeypath({
        type: KeypathInputType.Create,
        createKeypathPromise: suggestKeypathFn(
          extractedText,
          staticKeypathsInCurrentFile,
          namespace,
          tFuncInfo,
          moduleName,
        ),
        moduleName,
      })
      return { reused: false, value }
    } else {
      const value = await inputKeypath({
        type: KeypathInputType.Create,
        initValue: initKeypathValue,
        namespace,
        moduleName,
      })
      return { reused: false, value }
    }
  }

  // give selection: reuse OR suggest/create new keypath

  return await new Promise<{ reused: boolean; value: string | null }>((resolve) => {
    // prettier-ignore
    const quickPickConfig: QuickPickConfig<CreateOrReuseStep> = {
      [CreateOrReuseStep.Start]: {
        title: 'Reuse translation or create a new one',
        placeholder: 'Select action',
        commands: () => {
          return [
            ...exactMatchKeypaths.map(
              ([keypath, localizedText]) => ({
                icon: LucideIcon.CHECK, label: keypath, detail: 'Select to reuse',
                description: localizedTextDotJoined(localizedText),
                action: (controls: QuickPickControls<CreateOrReuseStep>) => {
                  resolve({ reused: true, value: keypath })
                  controls.dispose()
                }
              })
            ),
            {
              icon: LucideIcon.SPARKLES, label: 'Suggest keypath for new entry', action: suggestKeypath
            },
            {
              icon: LucideIcon.PENCIL, label: 'Enter keypath for new entry', action: enterKeypath,
            },
          ]
        }
      },
    }

    new ControlledQuickPicker(quickPickConfig)

    async function suggestKeypath(controls: QuickPickControls<CreateOrReuseStep>) {
      startTranslationFn()
      controls.dispose()
      const result = await inputKeypath({
        type: KeypathInputType.Create,
        createKeypathPromise: suggestKeypathFn(
          extractedText,
          staticKeypathsInCurrentFile,
          namespace,
          tFuncInfo,
          moduleName,
        ),
        moduleName,
      })
      resolve({ reused: false, value: result })
    }

    async function enterKeypath(controls: QuickPickControls<CreateOrReuseStep>) {
      startTranslationFn()
      controls.dispose()
      const entered = await inputKeypath({
        type: KeypathInputType.Create,
        initValue: initKeypathValue,
        namespace,
        moduleName,
      })
      resolve({ reused: false, value: entered })
    }
  })
}

function getExactMatchKeypaths(
  text: string,
  locale?: Locale,
  excludeKey?: string,
  namespace?: string,
  moduleName?: string,
): [string, LocalizedText][] {
  const srcLocale = locale ?? cfg.settings.sourceLocale
  return Object.entries(resourceService.getFlatTranslationsPerKeypath(namespace, moduleName)).filter(
    ([k, v]) =>
      (!excludeKey || k !== excludeKey) &&
      (srcLocale ? v[srcLocale] === text : Object.values(v).some((t) => t === text)),
  )
}

async function suggestKeypathFn(
  extractedText: string,
  keypathsInCurrentFile: KeypathInfo[],
  namespace: string,
  tFuncInfo: TFunctionInfo,
  moduleName?: string,
): Promise<string | null> {
  const editor = vscode.window.activeTextEditor!
  const line = editor.selection.active.line
  const surroundingCode = await getSurroundingCode(editor.document.uri, editor.selection.active.line)

  const otherKeysInFile = getLimitedItemsCloseToPisition(
    keypathsInCurrentFile.map((k) => ({ ...k, index: k.loc.line })),
    line,
    10,
  ).filter((item) => item.type === 'static')

  try {
    const aiKeypathSuggestion = await aiClient.createKeypath(
      extractedText,
      vscode.workspace.asRelativePath(editor.document.uri),
      surroundingCode,
      otherKeysInFile.length ? otherKeysInFile.map((k) => k.keypaths[0] ?? k.content) : undefined,
      namespace,
      tFuncInfo.prefix,
      moduleName,
    )
    return aiKeypathSuggestion?.trim() ?? null
  } catch (e: any) {
    // don't show anything to user, pending translation request will do that

    if (e?.status === 401) {
      // do not report
    } else {
      handleError({ e, internal: 'Keypath suggestion failed' })
    }

    // handled in keypath input
    throw e
  }
}

async function waitResponseWithProgress<T>(promise: Promise<T | undefined>): Promise<T | undefined> {
  return await new Promise<T | undefined>((resolve) => {
    const quickPickConfig: QuickPickConfig<CreateOrReuseStep> = {
      [CreateOrReuseStep.Start]: {
        title: 'Creating accurate translations ✨',
        placeholder: 'Loading...',
        commands: [],
      },
    }
    const quickPick = new ControlledQuickPicker(quickPickConfig)
    quickPick.controls.setLoading(true)

    quickPick.onDidHideCallback = () => {
      resolve(undefined)
    }

    promise
      .then((val) => {
        resolve(val)
      })
      .catch(() => {
        resolve(undefined)
      })
      .finally(() => {
        quickPick.controls.dispose()
      })
  })
}
