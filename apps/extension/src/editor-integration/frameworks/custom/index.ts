// Fallback framework: no built-in t-function conventions. Insertion offers the module's configured
// customTFunctions (falling back to `t` when none are set).

import * as vscode from 'vscode'
import { codeFamilyForExt } from '../../cursor-context'
import { extractFileExt } from '@repo/shared/core/helpers/path.helpers'
import { insertTFunctionVueI18n } from '../vue-i18n/insert-t-function-vue-i18n'
import { insertTFunctionReactBased } from '../insert-t-function-react-based'
import type { IdeFrameworkExtension } from '../types'

export const customExtension: IdeFrameworkExtension = {
  id: 'custom',
  getTFunctions: (_content, _fileExt, _cursorOffset, customFunctionNames) =>
    (customFunctionNames.length ? customFunctionNames : ['t']).map((tName) => ({ tName })),
  // No bespoke convention: pick the cursor path by the edited file's kind (Vue SFC vs JSX/plain),
  // emit via custom's own shared ideInsert.
  insertTFunction: (workspaceEdit, props) => {
    const ext = extractFileExt(vscode.window.activeTextEditor?.document.uri.path ?? '')
    return codeFamilyForExt(ext) === 'vue'
      ? insertTFunctionVueI18n(workspaceEdit, props, 'custom')
      : insertTFunctionReactBased('custom', workspaceEdit, props)
  },
}
