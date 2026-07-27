// Extension contract for an i18n framework's IDE-only capabilities (t-func insertion, cursor
// context, key-range detection). Kept separate from `@repo/shared`'s framework definitions — needs
// cursor/AST/vscode.WorkspaceEdit access with no place in a browser-compatible shared package.
// Everything else (defaultNs detection, interpolation wrap, linked messages) lives once on the
// shared `I18nFramework` and is looked up there directly via `getFramework`.

import type * as vscode from 'vscode'
import type { InsertTFunctionProps } from '../../types'
import type { I18nFrameworkId, TFunctionInfo } from '@repo/types/framework.types'

export interface IdeFrameworkExtension {
  id: I18nFrameworkId
  getTFunctions(
    content: string,
    fileExt: string,
    cursorOffset: number,
    customFunctionNames: string[],
    defaultNs: string,
  ): TFunctionInfo[]
  insertTFunction(workspaceEdit: vscode.WorkspaceEdit, props: InsertTFunctionProps): Promise<void> | void
}
