import { cloneDeep, isEqual } from 'lodash'
import * as vscode from 'vscode'
import { updateAnnotations } from './annotations'
import { handleAiApiError } from '../api/handle-ai-api-error'
import { aiClient } from '../api/ai-client'
import { ControlledQuickPicker, QuickPickConfig, QuickPickControls } from '../helpers/controlled-quick-picker'
import { sortLocalizedText } from '../helpers/helpers'
import { handleError } from '../helpers/error-handler'
import { saveWithDiffReview, singleKeypathEntries } from '../helpers/diff-review/save-with-diff-review'
import { TelemetryEvent } from '../telemetry/events'
import { reportEvent } from '../telemetry/telemetry'
import { usageService } from '../helpers/usage-service'
import { editAsJsonCmd } from './edit-as-json-cmd'
import { renameKeypathCmd } from './rename-keypath-cmd'
import { resourceService } from '../helpers/resource-service'
import { LucideIcon } from '../lucide-icons'

export interface CmdActionsWithTranslationsArgs {
  keypath: string
  namespace?: string
  prefix?: string
}

enum Step {
  Start = 'Start',
  Prompt = 'Prompt',
}

export async function actionsWithTranslationsCmd(
  context: vscode.ExtensionContext,
  args: CmdActionsWithTranslationsArgs,
) {
  reportEvent(TelemetryEvent.actionsWithTranslations)

  // the hovered file (active editor) determines which module this keypath belongs to
  const moduleName = resourceService.resolveViewForActiveEditor(args.keypath, args.namespace)?.name

  const existingTranslationsLocalizedText = resourceService.existingTranslationsLocalizedText(
    args.keypath,
    args.namespace,
    moduleName,
  )
  const allLocalesLocalizedText = resourceService.allLocalesLocalizedText(args.keypath, args.namespace, moduleName)
  const emptyLocales = Object.entries(allLocalesLocalizedText)
    .filter(([, v]) => !v)
    .map(([k]) => k)
  const filledLocales = Object.entries(allLocalesLocalizedText)
    .filter(([, v]) => !!v)
    .map(([k]) => k)

  const keypathFormatted = `'${args.keypath}'`
  const allTranslationsOrAllExisting = `all ${emptyLocales.length ? 'existing ' : ''}translations`

  // prettier-ignore
  const quickPickConfig: QuickPickConfig<Step> = {
    [Step.Start]: {
      title: `Actions with ${keypathFormatted}`,
      placeholder: 'Select action',
      commands: [
        {
          icon: LucideIcon.BRACES, label: 'Edit all translations manually', action: editManually
        },
        {
          icon: LucideIcon.LANGUAGES, label: 'Translate all empty', action: autoTranslateEmpty,
          enabled: () => !!filledLocales.length && !!emptyLocales.length
        },
        {
          icon: LucideIcon.MESSAGE_SQUARE_TEXT, label: `Adjust all translations with prompt...`, action: Step.Prompt,
          enabled: () => !!filledLocales.length
        },
        {
          icon: LucideIcon.KEY_ROUND, label: `Rename keypath`, description: args.keypath, action: renameKey
        },
      ]
    },

    [Step.Prompt]: {
      backBtn: Step.Start,
      title: `Tell AI what to change in ${allTranslationsOrAllExisting} of ${keypathFormatted}`,
      placeholder: 'e.g., "Shorten but keep meaning"',
      commands: [
        {
          icon: LucideIcon.SEND, label: 'Submit', action: submitPrompt,
          alwaysShow: true,
          picked: true,
          enabled: ({ inputValue }) => !!inputValue
        }
      ]
    },
  }

  new ControlledQuickPicker(quickPickConfig)

  // HELPERS

  function editManually(controls: QuickPickControls<Step>) {
    controls.dispose()
    editAsJsonCmd(context, args.keypath, args.namespace, moduleName)
  }

  async function autoTranslateEmpty(controls: QuickPickControls<Step>) {
    controls.setLoading(true)
    try {
      const codeContext = await usageService.getCodeContextForKeypath(args.keypath, args.namespace)
      const response = await aiClient.translateMultipleFromOthers(
        existingTranslationsLocalizedText,
        emptyLocales,
        args.keypath,
        codeContext,
      )

      controls.setLoading(false)

      if (!response) {
        handleError({
          snackbar: 'Invalid response, please try again',
          internal: 'translateMultipleFromOthers',
        })
        return
      }

      controls.dispose()

      const updated = Object.assign(cloneDeep(allLocalesLocalizedText), response.result)

      saveWithDiffReview([
        {
          originalObject: singleKeypathEntries(args.keypath, sortLocalizedText(allLocalesLocalizedText)),
          updatedObject: singleKeypathEntries(args.keypath, sortLocalizedText(updated)),
          overrideResolutions: response.overrideResolutions,
          saveCallback: async (finalResult) => {
            const values = finalResult[args.keypath] ?? {}
            const success = await resourceService.updateValues(values, args.keypath, args.namespace, moduleName)
            if (!success) {
              handleError({
                snackbar: 'Failed to save new translations',
                internal: 'actionsWithTranslationsCmd:autoTranslateEmpty - saving new translations failed',
              })
              return
            }
            vscode.window.showInformationMessage('New translations saved successfully')
          },
          options: { title: 'Review new translations' },
        },
      ])
    } catch (error) {
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }

  async function renameKey() {
    renameKeypathCmd(context, {
      keypath: args.keypath,
      initValue: args.keypath,
      namespace: args.namespace,
      prefix: args.prefix,
    })
  }

  async function submitPrompt(controls: QuickPickControls<Step>) {
    reportEvent(TelemetryEvent.actionsWithTranslations_editViaPrompt)
    controls.setLoading(true)
    try {
      const response = await aiClient.adjustAll(controls.inputValue, existingTranslationsLocalizedText)
      const result = response?.result

      controls.setLoading(false)

      if (!result) {
        handleError({ snackbar: 'Invalid response, please try again' })
        return
      }

      if (isEqual(existingTranslationsLocalizedText, result)) {
        handleError({ snackbar: 'No updates, please try different change' })
        return
      }

      controls.dispose()

      saveWithDiffReview([
        {
          originalObject: singleKeypathEntries(args.keypath, existingTranslationsLocalizedText),
          updatedObject: singleKeypathEntries(args.keypath, result),
          saveCallback: async (finalResult) => {
            const values = finalResult[args.keypath] ?? {}
            if (isEqual(existingTranslationsLocalizedText, values)) {
              // just close silently
              return
            }

            const success = await resourceService.updateValues(values, args.keypath, args.namespace, moduleName)
            if (!success) {
              handleError({
                snackbar: 'Failed to save updated translations',
                internal: 'actionsWithTranslationsCmd:submitPrompt - saving updated translations failed',
              })
              return
            }

            updateAnnotations()
            vscode.window.showInformationMessage('Translations updated successfully')

            reportEvent(TelemetryEvent.actionsWithTranslations_editViaPrompt_done, {
              prompt: controls.inputValue,
            })
          },
          options: {
            title: `Review changes for: "${controls.inputValue}"`,
          },
        },
      ])
    } catch (error: any) {
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }
}
