import { CursorContextVue } from './cursor-context-vue.types'
import { detectCursorContextVueAst } from './detect-cursor-context-vue-ast'
import { detectCursorContextVueManual } from './detect-cursor-context-vue-manual'

export function detectCursorContextVue(content: string, cursorOffset: number): CursorContextVue {
  const astParseResult = detectCursorContextVueAst(content, cursorOffset)
  if (astParseResult !== CursorContextVue.UNKNOWN) {
    return astParseResult
  }

  const manualParseResult = detectCursorContextVueManual(content, cursorOffset)
  return manualParseResult
}
