import { insertTFunctionPlain } from '../insert-t-function-plain'
import type { IdeFrameworkExtension } from '../types'

const LARAVEL_T_FUNCTIONS = ['__', 'trans', 'trans_choice', 'lang']

export const laravelExtension: IdeFrameworkExtension = {
  id: 'laravel',
  getTFunctions: (_content, _fileExt, _cursorOffset, customFunctionNames) =>
    (customFunctionNames.length ? customFunctionNames : LARAVEL_T_FUNCTIONS).map((tName) => ({ tName })),
  insertTFunction: (workspaceEdit, props) => insertTFunctionPlain('laravel', workspaceEdit, props),
}
