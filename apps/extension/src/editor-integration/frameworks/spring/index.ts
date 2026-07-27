import { insertTFunctionPlain } from '../insert-t-function-plain'
import type { IdeFrameworkExtension } from '../types'

export const springExtension: IdeFrameworkExtension = {
  id: 'spring',
  getTFunctions: (_content, _fileExt, _cursorOffset, customFunctionNames) =>
    (customFunctionNames.length ? customFunctionNames : ['getMessage']).map((tName) => ({ tName })),
  insertTFunction: (workspaceEdit, props) => insertTFunctionPlain('spring', workspaceEdit, props),
}
