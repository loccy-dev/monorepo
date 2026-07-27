import * as vscode from 'vscode'
import { extractFileExt } from '@repo/shared/core/helpers/path.helpers'
import type { Namespace } from '@repo/types/primitives.types'
import { getOrSelectTFunction } from './get-or-select-t-function'
import { getOrSelectNamespace } from './get-or-select-namespace'
import { resourceService, type ModuleView } from './resource-service'
import { handleError } from './error-handler'

/** Shown when an edit command runs in a file no configured module claims via `usages.include`. */
export const NO_OWNING_MODULE_MESSAGE =
  "This file isn't part of any i18n module — add its path to a module's `usages.include` in loccy.yaml."

export interface InsertContext {
  tFuncInfo: Awaited<ReturnType<typeof getOrSelectTFunction>>
  ns: Namespace
  view: ModuleView
}

/**
 * Shared prelude for the source-edit commands: resolve the module that owns the edited file, then
 * the t-function and namespace at the cursor. Returns `undefined` when the file belongs to no module
 * (an error is surfaced) or the user dismisses a picker — callers early-return either way.
 */
export async function resolveInsertContext(editor: vscode.TextEditor): Promise<InsertContext | undefined> {
  const view = resourceService.resolveSourceView(editor.document.uri)
  if (!view) {
    handleError({ snackbar: NO_OWNING_MODULE_MESSAGE, internal: 'resolveInsertContext: no owning module' })
    return undefined
  }
  const tFuncInfo = await getOrSelectTFunction(
    editor.document.getText(),
    extractFileExt(editor.document.uri.path),
    editor.document.offsetAt(editor.selection.start),
    editor.document.uri,
  )
  if (tFuncInfo.rejected) {
    return undefined
  }
  const { ns, rejected } = await getOrSelectNamespace(tFuncInfo.tFunctionInfo, editor.document.uri)
  if (rejected) {
    return undefined
  }
  return { tFuncInfo, ns, view }
}
