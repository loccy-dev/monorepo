import * as vscode from 'vscode'
import { registerVirtualSystemProvider } from './virtual-file-system-provider'
import { handleError } from './error-handler'
import { Logger } from './logger'
import { cfg } from '../global-config'

interface VirtualEditorOptions {
  fileName: string
  language: string
  content: string
  /** Called on every manual save. Resolve `true` to close the editor, `false` to keep it open for fixes. */
  onSave: (text: string) => Promise<boolean>
}

export function virtualEditorSaveHint() {
  return `Virtual file: Edit, then press ${cfg.isMacOs ? 'Cmd' : 'Ctrl'}+S to apply changes (file auto-disposed after).`
}

/**
 * Opens an in-memory document that applies its content on manual save.
 * Handles auto-save conflicts by delaying cleanup after editor closure.
 */
export async function openVirtualEditor({ fileName, language, content, onSave }: VirtualEditorOptions) {
  const provider = registerVirtualSystemProvider()
  const uri = vscode.Uri.parse(`loccy:///${fileName}`)

  try {
    provider.writeFile(uri, new TextEncoder().encode(content))
    const doc = await vscode.workspace.openTextDocument(uri)
    vscode.languages.setTextDocumentLanguage(doc, language)
    await vscode.window.showTextDocument(doc)
  } catch (error) {
    handleError({
      e: error,
      snackbar: 'Failed to open virtual editor',
      internal: 'openVirtualEditor_openFile',
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
        Logger.error('Error during openVirtualEditor cleanup: ' + JSON.stringify(error))
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

    if (!(await onSave(savedDoc.getText()))) {
      return
    }

    // Immediate cleanup after successful manual save
    cleanup(true)

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
  })

  // tabs, not visible editors: switching to another tab hides the editor without closing it
  const closeDisposable = vscode.window.tabGroups.onDidChangeTabs(() => {
    const isTabStillOpen = vscode.window.tabGroups.all.some((group) =>
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputText && tab.input.uri.path === uri.path),
    )

    if (!isTabStillOpen && !isCleanedUp) {
      // Use delayed cleanup to handle potential auto-save conflicts
      cleanup(false)
    }
  })
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
