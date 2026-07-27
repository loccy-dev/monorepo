import { getTFunctionsNextIntl } from '@repo/shared/core/frameworks/next-intl/detection'
import { insertTFunctionNextIntl } from './insert-t-function-next-intl'
import type { IdeFrameworkExtension } from '../types'

export const nextIntlExtension: IdeFrameworkExtension = {
  id: 'next-intl',
  getTFunctions: (content, _fileExt, _cursorOffset, customFunctionNames) =>
    getTFunctionsNextIntl(content, customFunctionNames),
  insertTFunction: insertTFunctionNextIntl,
}
