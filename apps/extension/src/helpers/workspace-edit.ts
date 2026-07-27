import * as vscode from 'vscode'
import type { Loc } from '@repo/types/platform.types'

export const editWorkspaceAndSave = async (
  collectEdits: (workspaceEdit: vscode.WorkspaceEdit) => Promise<void>,
  onSuccess?: (affectedUris: vscode.Uri[]) => Promise<void>,
): Promise<boolean> => {
  const workspaceEdit = new vscode.WorkspaceEdit()
  await collectEdits(workspaceEdit)
  const success = await vscode.workspace.applyEdit(workspaceEdit, { isRefactoring: true })

  if (success) {
    const affectedUris = Array.from(workspaceEdit.entries()).map(([uri]) => uri)

    await Promise.all(
      affectedUris.map(async (uri) => {
        const doc = await vscode.workspace.openTextDocument(uri)
        if (doc.isDirty) {
          await doc.save()
        }
      }),
    )

    if (onSuccess) {
      await onSuccess(affectedUris)
    }
  }

  return success
}

export const collectChangesToReplaceFromTo = async (
  workspaceEdit: vscode.WorkspaceEdit,
  editor: vscode.TextEditor,
  loc: Loc,
  replacement: string,
) => {
  const valueStart = editor.document.positionAt(loc.start)
  const valueEnd = editor.document.positionAt(loc.end)
  workspaceEdit.replace(editor.document.uri, new vscode.Range(valueStart, valueEnd), replacement)
}
