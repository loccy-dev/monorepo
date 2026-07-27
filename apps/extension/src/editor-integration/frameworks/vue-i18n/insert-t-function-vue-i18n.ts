import * as vscode from 'vscode'
import { InsertTFunctionProps } from '../../../types'
import { detectCursorContextVue } from '../../cursor-context/vue/detect-cursor-context-vue'
import { CursorContextVue } from '../../cursor-context/vue/cursor-context-vue.types'
import { collectChangesToReplaceFromTo } from '../../../helpers/workspace-edit'
import { getFramework } from '@repo/shared/core/registry'
import type { I18nFrameworkId } from '@repo/types/framework.types'

export async function insertTFunctionVueI18n(
  workspaceEdit: vscode.WorkspaceEdit,
  props: InsertTFunctionProps,
  frameworkId: I18nFrameworkId,
) {
  const { loc, keypath, tFunctionInfo, params, eraseQuotes, cleanSrcText, count } = props

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const docText = editor.document.getText()

  const context = detectCursorContextVue(docText, loc.start)

  const forceSingleQuote = context === CursorContextVue.TEMPLATE_ATTR || context === CursorContextVue.VUE_DIRECTIVE
  const quoteType = forceSingleQuote || props.quoteType === 'single' ? 'single' : 'double'
  const wrapInterpolation = context === CursorContextVue.TEMPLATE_TAG ? '{{}}' : undefined

  let textToInsert = getFramework(frameworkId)!.ideInsert!.insertTFunctionText({
    tFunctionInfo,
    keypath,
    params,
    quoteType,
    wrapInterpolation,
    count,
  })

  // handle Vue template attribute context - add colon prefix
  let finalLoc = loc
  if (context === CursorContextVue.TEMPLATE_ATTR) {
    const beforeLoc = docText.substring(0, loc.start)
    const attrMatch = beforeLoc.match(/(\s+)(\w+)(\s*=\s*)(["'])$/)
    if (attrMatch) {
      const [fullMatch, whitespace, attrName] = attrMatch
      const attrStart = loc.start - fullMatch.length + whitespace.length

      if (!attrName.startsWith(':')) {
        textToInsert = `:${attrName}="${textToInsert}"` // using double quote, because single quote is used for t-func
        finalLoc = {
          ...loc,
          start: attrStart,
          end: loc.end + 1, // eat quote at the end
        }
      }
    }
  }

  if (eraseQuotes) {
    const neverEraseQuotes: CursorContextVue[] = [CursorContextVue.TEMPLATE_TAG, CursorContextVue.TEMPLATE_ATTR]

    const locationContent = docText.slice(loc.start, loc.end).trim()
    const isSelectionWithQuotes = cleanSrcText && locationContent.slice(1, -1) === cleanSrcText

    const symbolBefore = docText.slice(loc.start - 1, loc.start)
    const symbolAfter = docText.slice(loc.end, loc.end + 1)
    const isSelectionBetweenAngleBrackets = symbolBefore === '>' || symbolAfter === '<'

    const ignore = isSelectionBetweenAngleBrackets || neverEraseQuotes.includes(context) || isSelectionWithQuotes

    if (!ignore) {
      finalLoc = { ...finalLoc, start: finalLoc.start - 1, end: finalLoc.end + 1 }
    }
  }

  await collectChangesToReplaceFromTo(workspaceEdit, editor, finalLoc, textToInsert)
}
