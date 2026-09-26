import { isEqual } from 'lodash'
import * as vscode from 'vscode'
import type { Namespace } from '@repo/types/primitives.types'
import { aiClient } from '../api/ai-client'
import { handleAiApiError } from '../api/handle-ai-api-error'
import type { QuickPickControls } from '../helpers/controlled-quick-picker'
import { saveWithDiffReview, singleKeypathEntries } from '../helpers/diff-review/save-with-diff-review'
import { handleError } from '../helpers/error-handler'
import { resourceService } from '../helpers/resource-service'
import { TelemetryEvent } from '../telemetry/events'
import { reportEvent } from '../telemetry/telemetry'
import { updateAnnotations } from './annotations'

interface AdjustAllWithPromptArgs {
  prompt: string
  keypath: string
  namespace?: Namespace
  moduleName?: string
}

/** AI rewrites every existing translation of a keypath per `prompt`; changes are saved after diff review. */
export async function adjustAllWithPrompt<Step extends string>(
  controls: QuickPickControls<Step>,
  { prompt, keypath, namespace, moduleName }: AdjustAllWithPromptArgs,
) {
  reportEvent(TelemetryEvent.actionsWithTranslations_editViaPrompt)
  const existing = resourceService.existingTranslationsLocalizedText(keypath, namespace, moduleName)
  controls.setLoading(true)
  try {
    const response = await aiClient.adjustAll(prompt, existing)
    const result = response?.result

    controls.setLoading(false)

    if (!result) {
      handleError({ snackbar: 'Invalid response, please try again' })
      return
    }

    if (isEqual(existing, result)) {
      handleError({ snackbar: 'No updates, please try different change' })
      return
    }

    controls.dispose()

    saveWithDiffReview([
      {
        originalObject: singleKeypathEntries(keypath, existing),
        updatedObject: singleKeypathEntries(keypath, result),
        saveCallback: async (finalResult) => {
          const values = finalResult[keypath] ?? {}
          if (isEqual(existing, values)) {
            // just close silently
            return
          }

          const success = await resourceService.updateValues(values, keypath, namespace, moduleName)
          if (!success) {
            handleError({
              snackbar: 'Failed to save updated translations',
              internal: 'adjustAllWithPrompt - saving updated translations failed',
            })
            return
          }

          updateAnnotations()
          vscode.window.showInformationMessage('Translations updated successfully')

          reportEvent(TelemetryEvent.actionsWithTranslations_editViaPrompt_done, { prompt })
        },
        options: {
          title: `Review changes for: "${prompt}"`,
        },
      },
    ])
  } catch (error) {
    controls.setLoading(false)
    handleAiApiError(error)
  }
}
