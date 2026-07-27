import * as vscode from 'vscode'
import { ControlledQuickPicker, QuickPickConfig } from '../helpers/controlled-quick-picker'
import { handleAiApiError } from '../api/handle-ai-api-error'
import { aiClient } from '../api/ai-client'
import { sortLocalizedText } from '../helpers/helpers'
import { getLineIndex } from '@repo/shared/core/helpers/helpers'
import { handleError } from '../helpers/error-handler'
import { inputKeypath, KeypathInputType } from '../helpers/input-keypath'
import { SuggestContextualTranslationOutput } from '@repo/types/ai-action.types'
import { resolveInsertContext } from '../helpers/resolve-insert-context'
import { resourceService } from '../helpers/resource-service'
import { saveWithDiffReview, singleKeypathEntries } from '../helpers/diff-review/save-with-diff-review'
import { getKeyRanges } from '../editor-integration/frameworks/get-key-ranges'
import { insertTFunction } from '../editor-integration/frameworks/insert-t-function'
import { editWorkspaceAndSave } from '../helpers/workspace-edit'

enum Step {
  Start = 'Start',
}

export async function suggestContextualTranslationCmd() {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    handleError({ snackbar: 'No active editor found', internal: 'createContextualTranslationCmd' })
    return
  }

  const ctx = await resolveInsertContext(editor)
  if (!ctx) {
    return
  }
  const { tFuncInfo, ns, view } = ctx
  const sourceUri = editor.document.uri
  const moduleName = view.name

  const docText = editor.document.getText()

  // prettier-ignore
  const quickPickConfig: QuickPickConfig<Step> = {
    [Step.Start]: {
      title: `Create contextual translation`,
      placeholder: 'Loading...',
      commands: [],
    },
  }

  const quickPick = new ControlledQuickPicker(quickPickConfig)
  quickPick.controls.setLoading(true)

  const cursorOffset = editor.document.offsetAt(editor.selection.anchor)

  const charsBefore = 1000
  const charsAfter = 1000
  const start = Math.max(0, cursorOffset - charsBefore)
  const end = Math.min(docText.length, cursorOffset + charsAfter)
  const textBefore = docText.slice(start, cursorOffset)
  const textAfter = docText.slice(cursorOffset, end)
  const ctxTextForLlm = `${textBefore}<USER CURSOR IS HERE>${textAfter}`

  const keypathRanges = await getKeyRanges(docText, editor.document.uri)
  const relevantKeys = keypathRanges.filter((k) => k.loc.start >= start && k.loc.start <= end && k.type === 'static')
  const relevantTranslations = Object.fromEntries(
    relevantKeys
      .map((k) => {
        const key = k.keypaths[0] ?? k.content
        return [key, resourceService.getFlatTranslationsPerKeypath(ns, moduleName)[key]]
      })
      .filter(([, v]) => !!v && !!Object.keys(v).length),
  )
  const filePath = vscode.workspace.asRelativePath(editor.document.fileName)

  try {
    const response = await aiClient.suggestContextualTranslation(
      ctxTextForLlm,
      relevantTranslations,
      filePath,
      ns,
      moduleName,
    )
    const result = response?.result

    if (!result || !result.length) {
      quickPick.controls.dispose()
      handleError({
        snackbar: 'Unable to fetch translation suggestions for this cursor position',
        internal: 'createContextualTanslation:invalidResult',
      })
      return
    }

    quickPick.controls.dispose()

    saveWithDiffReview(
      result.map((variant) => {
        const updatedObject = sortLocalizedText(variant.translations)
        return {
          originalObject: singleKeypathEntries(variant.keypath, {}),
          updatedObject: singleKeypathEntries(variant.keypath, updatedObject),
          overrideResolutions: variant.overrideResolutions,
          saveCallback: (finalResult) => {
            void applyVariant(variant, finalResult[variant.keypath] ?? {})
          },
          options: {
            title: variant.keypath,
            description: variant.explanation,
            saveBtn: 'Insert translation',
          },
        }
      }),
    )
  } catch (error: any) {
    quickPick.controls.dispose()
    handleAiApiError(error)
  }

  async function applyVariant(
    selectedVariant: SuggestContextualTranslationOutput[number],
    translationsToSave: Record<string, string>,
  ) {
    let validKeypath: string | null = null
    if (selectedVariant.keypath in resourceService.getFlatTranslationsPerKeypath(ns, moduleName)) {
      // edge-case: existing keypath was used
      validKeypath = await inputKeypath({
        type: KeypathInputType.Create,
        initValue: selectedVariant.keypath,
        namespace: ns,
        moduleName,
      })
    } else {
      validKeypath = selectedVariant.keypath
    }

    if (!validKeypath) {
      return
    }

    const loc = {
      start: cursorOffset,
      end: cursorOffset,
      line: getLineIndex(docText, cursorOffset),
    }

    let affectedResourceUris: vscode.Uri[] = []

    const success = await editWorkspaceAndSave(async (workspaceEdit) => {
      const translationFileUpdates = await resourceService.collectWorkspaceChangesForNewMessage(
        workspaceEdit,
        { [validKeypath]: translationsToSave },
        ns,
        moduleName,
      )
      affectedResourceUris = translationFileUpdates.affectedUris

      await insertTFunction(
        workspaceEdit,
        { loc, keypath: validKeypath, tFunctionInfo: tFuncInfo.tFunctionInfo },
        sourceUri,
      )
    })

    if (!success) {
      handleError({
        snackbar: 'Failed to create new message',
        internal: 'suggestContextualTranslationCmd: saving new message failed',
      })
      return
    }
  }
}
