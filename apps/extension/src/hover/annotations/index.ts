import * as vscode from 'vscode'
import { updateTranslationAnnotations, updateTranslationAnnotationsDebounced } from './translation-annotations'
import { fileResolver, FileType } from '../../helpers/file-resolver'
import { pendingDocument } from './state'
import { updateUsageAnnotations, updateUsageAnnotationsDebounced } from './usage-annotations'

export function registerAnnotations(context: vscode.ExtensionContext) {
  updateAnnotations()

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!vscode.window.activeTextEditor || event.document !== vscode.window.activeTextEditor.document) {
        return
      }

      const editor = vscode.window.activeTextEditor
      const fileType = fileResolver.checkFileType(editor.document.uri)

      if (fileType === FileType.Resource) {
        updateTranslationAnnotationsDebounced(editor)
      } else if (fileType === FileType.Source) {
        updateUsageAnnotationsDebounced.cancel()
        pendingDocument.uri = event.document.uri
        pendingDocument.version = event.document.version
        updateUsageAnnotationsDebounced(editor, true)
      }
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      if (!vscode.window.activeTextEditor) {
        return
      }

      const editor = vscode.window.activeTextEditor
      const fileType = fileResolver.checkFileType(editor.document.uri)

      if (fileType === FileType.Resource) {
        updateTranslationAnnotationsDebounced(editor)
      } else if (fileType === FileType.Source) {
        updateUsageAnnotations(editor, false)
      }
    }),
  )

  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (!vscode.window.activeTextEditor || event.textEditor !== vscode.window.activeTextEditor) {
        return
      }

      const editor = vscode.window.activeTextEditor
      const fileType = fileResolver.checkFileType(editor.document.uri)

      if (fileType === FileType.Resource) {
        updateTranslationAnnotationsDebounced(editor)
      }
    }),
  )
}

export async function updateAnnotations(isEditing = false) {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }

  const fileType = fileResolver.checkFileType(editor.document.uri)

  if (fileType === FileType.Resource) {
    updateTranslationAnnotations(editor)
  } else if (fileType === FileType.Source) {
    updateUsageAnnotations(editor, false)
  }
}
