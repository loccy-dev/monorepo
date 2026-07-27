import { getTFunctionsVueI18n } from './get-t-functions-vue-i18n'
import { insertTFunctionVueI18n } from './insert-t-function-vue-i18n'
import type { IdeFrameworkExtension } from '../types'

export const vueI18nExtension: IdeFrameworkExtension = {
  id: 'vue-i18n',
  getTFunctions: getTFunctionsVueI18n,
  insertTFunction: (workspaceEdit, props) => insertTFunctionVueI18n(workspaceEdit, props, 'vue-i18n'),
}
