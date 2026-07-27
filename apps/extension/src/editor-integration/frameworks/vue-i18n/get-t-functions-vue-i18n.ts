import { CursorContextVue } from '../../cursor-context/vue/cursor-context-vue.types'
import { detectCursorContextVue } from '../../cursor-context/vue/detect-cursor-context-vue'
import type { TFunctionInfo } from '@repo/types/framework.types'

export function getTFunctionsVueI18n(
  content: string,
  fileExt: string,
  cursorOffset: number,
  customFunctionNames: string[],
): TFunctionInfo[] {
  let tFunctionNames: string[] = []

  if (fileExt === 'vue') {
    const context = detectCursorContextVue(content, cursorOffset)
    switch (context) {
      case CursorContextVue.TEMPLATE_TAG:
        // <h1> | </h1>  (becomes interpolation afterwards)
        tFunctionNames = ['$t']
        break
      case CursorContextVue.TEMPLATE_INTERPOLATION:
        // {{ | }}
        tFunctionNames = ['$t']
        break
      case CursorContextVue.TEMPLATE_ATTR:
        // alt=" | "
        tFunctionNames = ['$t']
        break
      case CursorContextVue.VUE_DIRECTIVE:
        // :alt=" | "
        tFunctionNames = ['$t']
        break
      case CursorContextVue.SCRIPT_SETUP:
        tFunctionNames = ['t']
        break
      case CursorContextVue.SCRIPT_OPTIONS:
        tFunctionNames = ['this.$t']
        break
      default:
        tFunctionNames = ['t', '$t', 'this.$t']
    }
  } else {
    tFunctionNames = customFunctionNames
  }

  if (tFunctionNames.length) {
    return tFunctionNames.map((tName) => ({ tName }))
  }
  return [{ tName: 't' }]
}
