import * as vscode from 'vscode'
import { buildDecorations, previewDecorationType, transparentDecorationType } from './build-decorations'
import { pendingDocument } from './state'
import { usageService } from '../../helpers/usage-service'
import { debounce } from 'lodash'
import { ANNOTATIONS_DEBOUNCE_DELAY } from '../../config'
import type { KeypathInfo } from '@repo/types/framework.types'
import { getKeyRanges } from '../../editor-integration/frameworks/get-key-ranges'
import { resourceService } from '../../helpers/resource-service'

export async function updateUsageAnnotations(editor: vscode.TextEditor, isEditing: boolean) {
  const capturedDocumentUri = editor.document.uri
  const capturedDocumentVersion = editor.document.version

  let keypathRanges: KeypathInfo[] = []

  const isUsageServiceInitialized = usageService.initialized
  if (isUsageServiceInitialized) {
    const pendingKeyParse = usageService.documentParsePromises.get(editor.document.uri.toString())
    if (pendingKeyParse) {
      try {
        await pendingKeyParse
      } catch {
        // was aborted, do not render, wait for next call
        return
      }
    }
    keypathRanges = usageService.perFile.get(editor.document.uri.toString()) || []
  } else {
    // render annotations immediately on workspace open, even if usageService has not scanned all files yet
    keypathRanges = await getKeyRanges(editor.document.getText(), editor.document.uri)
  }

  if (keypathRanges.length === 0) {
    editor.setDecorations(transparentDecorationType, [])
    editor.setDecorations(previewDecorationType, [])
    return
  }

  // source file → the module owning its usages (by src.include), so hovers use that module's data
  const view = resourceService.resolveView({ sourceUri: editor.document.uri })
  const { inline, preview } = buildDecorations(editor, keypathRanges, true, view)

  const apply = () => {
    editor.setDecorations(transparentDecorationType, inline)
    editor.setDecorations(previewDecorationType, preview)
  }

  if (isEditing) {
    if (
      !pendingDocument.uri ||
      (capturedDocumentUri.toString() === pendingDocument.uri.toString() &&
        capturedDocumentVersion === pendingDocument.version)
    ) {
      apply()
    }
  } else {
    apply()
  }
}

export const updateUsageAnnotationsDebounced = debounce(updateUsageAnnotations, ANNOTATIONS_DEBOUNCE_DELAY)
