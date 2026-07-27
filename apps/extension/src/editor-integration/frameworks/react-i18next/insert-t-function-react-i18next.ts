import type * as vscode from 'vscode'
import { InsertTFunctionProps } from '../../../types'
import { insertTFunctionReactBased } from '../insert-t-function-react-based'

export function insertTFunctionReactI18next(workspaceEdit: vscode.WorkspaceEdit, props: InsertTFunctionProps) {
  return insertTFunctionReactBased('react-i18next', workspaceEdit, props)
}
