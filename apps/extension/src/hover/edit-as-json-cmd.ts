import * as vscode from 'vscode'
import JSON5 from 'json5'
import { registerVirtualSystemProvider } from '../helpers/virtual-file-system-provider'
import type { LocalizedText } from '@repo/types/primitives.types'
import { reportEvent } from '../telemetry/telemetry'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import { cfg } from '../global-config'
import { Logger } from '../helpers/logger'
import { resourceService } from '../helpers/resource-service'

/**
 * Opens a virtual JSON file for editing translations of a specific keypath.
 * Handles auto-save conflicts by delaying cleanup after editor closure.
 */
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

  const messages = {
    info: `Virtual file: Edit, then press ${cfg.isMacOs ? 'Cmd' : 'Ctrl'}+S to apply changes (file auto-disposed after).`,
  }

  const provider = registerVirtualSystemProvider()
  const uri = vscode.Uri.parse(`loccy:///${keypath}.json`)
  const content = `${Object.values(messages)
    .map((m) => `// ${m}`)
    .join('\n')}\n\n${JSON.stringify(translationsJSON, null, 2)}`

  try {
    provider.writeFile(uri, new TextEncoder().encode(content))
    const doc = await vscode.workspace.openTextDocument(uri)
    vscode.languages.setTextDocumentLanguage(doc, 'jsonc')
    await vscode.window.showTextDocument(doc)
  } catch (error) {
    handleError({
      e: error,
      snackbar: 'Failed to open translation editor',
      internal: 'editAsJsonCmd_openFile',
    })
    return
  }

  let isCleanedUp = false
  let cleanupTimeoutId: NodeJS.Timeout | null = null

  /** Cleanup with delay — lets any pending auto-save finish before disposal. */
  function cleanup(immediate = false) {
    if (isCleanedUp) {
      return
    }

    if (cleanupTimeoutId) {
      clearTimeout(cleanupTimeoutId)
      cleanupTimeoutId = null
    }

    const performCleanup = () => {
      if (isCleanedUp) {
        return
      }
      isCleanedUp = true

      try {
        provider.clearFile(uri)
        willSaveDisposable.dispose()
        saveDisposable.dispose()
        closeDisposable.dispose()
      } catch (error) {
        // Log but don't show error to user during cleanup
        Logger.error('Error during editAsJsonCmd cleanup: ' + JSON.stringify(error))
      }
    }

    if (immediate) {
      performCleanup()
    } else {
      const autoSaveDelay = getAutoSaveDelay()
      const cleanupDelay = Math.max(autoSaveDelay + 200, 1200) // Add buffer, minimum 1200ms

      cleanupTimeoutId = setTimeout(performCleanup, cleanupDelay)
    }
  }

  // Track save reason to distinguish manual vs auto-save
  let saveReason: vscode.TextDocumentSaveReason | null = null

  const willSaveDisposable = vscode.workspace.onWillSaveTextDocument((event) => {
    if (uri.path === event.document.uri.path && !isCleanedUp) {
      saveReason = event.reason
    }
  })

  const saveDisposable = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
    if (savedDoc.uri.path !== uri.path || isCleanedUp) {
      return
    }

    if (saveReason !== vscode.TextDocumentSaveReason.Manual) {
      saveReason = null
      return
    }
    saveReason = null

    try {
      const translations = parseTranslationsInput(savedDoc.getText())

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
          return
        }
        vscode.window.showInformationMessage('Translation updated successfully')
        reportEvent(TelemetryEvent.actionsWithTranslations_editAsJson_done)
      } else {
        vscode.window.showInformationMessage('No changes detected')
        reportEvent(TelemetryEvent.actionsWithTranslations_editAsJson_unchanged)
      }

      // Immediate cleanup after successful manual save
      cleanup(true)

      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    } catch (error: any) {
      handleError({
        e: error,
        snackbar: `Error processing translations: ${error.message}`,
        internal: 'editAsJsonCmd_processSave',
      })
    }
  })

  const closeDisposable = vscode.window.onDidChangeVisibleTextEditors((editors) => {
    const isEditorStillOpen = editors.some((e) => e.document.uri.path === uri.path)

    if (!isEditorStillOpen && !isCleanedUp) {
      // Use delayed cleanup to handle potential auto-save conflicts
      cleanup(false)
    }
  })
}

export function parseTranslationsInput(text: string): Record<string, string> {
  const parsed = JSON5.parse<Record<string, string>>(text)

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid JSON format - must be an object')
  }

  return parsed
}

/** Reads auto-save delay from vscode settings; falls back to a safe default on error. */
function getAutoSaveDelay(): number {
  try {
    const config = vscode.workspace.getConfiguration('files')
    const autoSave = config.get<string>('autoSave', 'off')

    if (autoSave === 'afterDelay') {
      const delay = config.get<number>('autoSaveDelay', 1000)
      // Ensure reasonable bounds (VSCode typically allows 1-10000ms)
      return Math.min(Math.max(delay, 1), 10000)
    }

    // If auto-save is off or onFocusChange, return minimal delay
    return 100
  } catch (error) {
    // Fallback to safe default if config reading fails
    Logger.warn('Failed to read auto-save configuration: ' + JSON.stringify(error))
    return 1000
  }
}
