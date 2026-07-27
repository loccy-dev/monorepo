import { getTFunctionsReactI18next } from '@repo/shared/core/frameworks/react-i18next/detection'
import { insertTFunctionReactI18next } from './insert-t-function-react-i18next'
import type { IdeFrameworkExtension } from '../types'

export const reactI18nextExtension: IdeFrameworkExtension = {
  id: 'react-i18next',
  getTFunctions: (content, _fileExt, _cursorOffset, customFunctionNames, defaultNs) =>
    getTFunctionsReactI18next(content, defaultNs, customFunctionNames),
  insertTFunction: insertTFunctionReactI18next,
}
