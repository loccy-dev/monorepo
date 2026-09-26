import * as vscode from 'vscode'
import JSON5 from 'json5'
import type { LocalizedText } from '@repo/types/primitives.types'
import { reportEvent } from '../telemetry/telemetry'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import { resourceService } from '../helpers/resource-service'
import { openVirtualEditor, virtualEditorSaveHint } from '../helpers/virtual-editor'

/** Opens a virtual JSON file for editing translations of a specific keypath. */
export async function editAsJsonCmd(
  context: vscode.ExtensionContext,
  keypath: string,
  namespace?: string,
  moduleName?: string,
) {
  reportEvent(TelemetryEvent.actionsWithTranslations_editAsJson)

  const view = moduleName ? resourceService.view(moduleName) : resourceService.primaryView()
  const allLocales = view?.allLocales ?? resourceService.allLocales
  const perKeypath = resourceService.getFlatTranslationsPerKeypath(namespace, moduleName)

  const translationsJSON = Object.fromEntries(
    allLocales.map((l) => [l, perKeypath[keypath]?.[l] ?? '']),
  ) as LocalizedText

  await openVirtualEditor({
    fileName: `${keypath}.json`,
    language: 'jsonc',
    content: `// ${virtualEditorSaveHint()}\n\n${JSON.stringify(translationsJSON, null, 2)}`,
    onSave: async (text) => {
      try {
        const translations = parseTranslationsInput(text)

        let changes: LocalizedText = {}

        for (const locale in translationsJSON) {
          const translation = translations[locale] ?? ''

          if (translationsJSON[locale] !== translation) {
            changes[locale] = translation as string
          }
        }

        if (Object.keys(changes).length) {
          const success = await resourceService.updateValues(changes, keypath, namespace, moduleName)
          if (!success) {
            handleError({
              snackbar: 'Failed to update translations',
              internal: 'editAsJsonCmd_processSave - updating translations failed',
            })
            return false
          }
          vscode.window.showInformationMessage('Translation updated successfully')
          reportEvent(TelemetryEvent.actionsWithTranslations_editAsJson_done)
        } else {
          vscode.window.showInformationMessage('No changes detected')
          reportEvent(TelemetryEvent.actionsWithTranslations_editAsJson_unchanged)
        }

        return true
      } catch (error: any) {
        handleError({
          e: error,
          snackbar: `Error processing translations: ${error.message}`,
          internal: 'editAsJsonCmd_processSave',
        })
        return false
      }
    },
  })
}

export function parseTranslationsInput(text: string): Record<string, string> {
  // nothing but the header comment left in the editor means an empty object
  if (!text.replace(/\/\/.*$/gm, '').trim()) {
    return {}
  }

  const parsed = JSON5.parse<Record<string, string>>(text)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid JSON format - must be an object')
  }

  return parsed
}
