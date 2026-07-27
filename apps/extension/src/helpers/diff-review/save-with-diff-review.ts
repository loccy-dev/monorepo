import * as vscode from 'vscode'

import { resourceService } from '../resource-service'
import { sortLocalizedText } from '../helpers'
import { diffPreviewTemplate } from './webview'
import { cloneDeep } from 'lodash'
import { OverrideResolution } from '@repo/types/ai-action.types'
/** Values to write, keyed keypath → locale → value. One keypath for a plain message or value-locus
 * plural; several sibling keys for a key-locus plural. Mirrors the resource write model exactly. */
export type DiffEntries = Record<string, Record<string, string>>

export type DiffReviewProps = {
  originalObject: DiffEntries
  updatedObject: DiffEntries
  saveCallback: (finalUpdatedObject: DiffEntries) => void
  /** Regional-override decisions for this item; inherited ones are shown as info (no diff row). */
  overrideResolutions?: OverrideResolution[]
  options?: {
    title?: string
    description?: string
    saveBtn?: string
  }
}

/** Wrap a single keypath's per-locale values into the keypath-keyed diff model. */
export function singleKeypathEntries(keypath: string, values: Record<string, string>): DiffEntries {
  return { [keypath]: values }
}

export type DiffPreviewOptions = {
  usageContext?: string | null
}

export async function saveWithDiffReview(data: DiffReviewProps[], options: DiffPreviewOptions = {}) {
  const panel = vscode.window.createWebviewPanel(
    'loccyDiffPreview',
    'Loccy: Confirm changes or close to discard',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [],
      retainContextWhenHidden: true,
    },
  )

  const dataCopy = cloneDeep(data)
  for (const item of dataCopy) {
    item.originalObject = normalizeEntries(item.originalObject)
    item.updatedObject = normalizeEntries(item.updatedObject)
  }

  const updateWebview = () => {
    panel.webview.html = diffPreviewTemplate(dataCopy, options)
  }

  updateWebview()

  let pendingSaveIndex: number | undefined

  const messageDisposable = panel.webview.onDidReceiveMessage(async (message) => {
    switch (message.command) {
      case 'save':
        pendingSaveIndex = message.index
        panel.dispose()
        break
      case 'cancel':
        panel.dispose()
        break
      case 'editValue': {
        const entries = dataCopy[message.index].updatedObject
        entries[message.keypath] = { ...entries[message.keypath], [message.key]: message.value }
        updateWebview()
        break
      }
    }
  })

  panel.onDidDispose(() => {
    messageDisposable.dispose()

    if (pendingSaveIndex === undefined) {
      return
    }

    const saveFn = () => {
      const index = pendingSaveIndex!
      data[index].saveCallback(dataCopy[index].updatedObject)
    }

    // Rare: editor already active — save immediately.
    if (vscode.window.activeTextEditor) {
      saveFn()
      return
    }

    // Otherwise wait for an editor to activate before saving.
    const editorWatcher = vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        saveFn()
        editorWatcher.dispose()
      }
    })
  })
}

/** Keep only project locales in each keypath's map, and sort locales within each. */
function normalizeEntries(entries: DiffEntries): DiffEntries {
  return Object.fromEntries(
    Object.entries(entries).map(([keypath, locales]) => {
      const projectOnly = Object.fromEntries(
        Object.entries(locales).filter(([locale]) => resourceService.allLocales.includes(locale)),
      )
      return [keypath, sortLocalizedText(projectOnly)]
    }),
  )
}
