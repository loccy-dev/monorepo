import type * as vscode from 'vscode'
import { InsertTFunctionProps } from '../../../types'
import { insertTFunctionReactBased } from '../insert-t-function-react-based'

export function insertTFunctionNextIntl(workspaceEdit: vscode.WorkspaceEdit, props: InsertTFunctionProps) {
  return insertTFunctionReactBased('next-intl', workspaceEdit, props)
}
