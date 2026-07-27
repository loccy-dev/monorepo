import * as vscode from 'vscode'
import { CursorContextReact } from '../cursor-context/react/cursor-context-react.types'
import { detectCursorContextReact } from '../cursor-context/react/detect-cursor-context-react'
import { InsertTFunctionProps } from '../../types'
import { collectChangesToReplaceFromTo } from '../../helpers/workspace-edit'
import { getFramework } from '@repo/shared/core/registry'
import type { I18nFrameworkId } from '@repo/types/framework.types'

export async function insertTFunctionReactBased(
  frameworkId: I18nFrameworkId,
  workspaceEdit: vscode.WorkspaceEdit,
  props: InsertTFunctionProps,
) {
  const { loc, keypath, tFunctionInfo, eraseQuotes, cleanSrcText, params, quoteType, count } = props

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const docText = editor.document.getText()

  const context = detectCursorContextReact(docText, loc.start)
  const wrapInterpolation =
    context === CursorContextReact.JSX_ELEMENT_CONTENT || context === CursorContextReact.JSX_ATTRIBUTE_VALUE
      ? '{}'
      : undefined

  const textToInsert = getFramework(frameworkId)!.ideInsert!.insertTFunctionText({
    tFunctionInfo,
    keypath,
    params,
    quoteType,
    wrapInterpolation,
    count,
  })

  let finalLoc = loc
  if (eraseQuotes) {
    const locationContent = docText.slice(loc.start, loc.end).trim()
    const isSelectionWithQuotes = !!cleanSrcText && locationContent.slice(1, -1) === cleanSrcText

    const symbolBefore = docText.slice(loc.start - 1, loc.start)
    const symbolAfter = docText.slice(loc.end, loc.end + 1)
    const isSelectionBetweenAngleBrackets = symbolBefore === '>' || symbolAfter === '<'

    const ignore = isSelectionBetweenAngleBrackets || isSelectionWithQuotes

    if (!ignore) {
      finalLoc = { ...finalLoc, start: finalLoc.start - 1, end: finalLoc.end + 1 }
    }
  }

  await collectChangesToReplaceFromTo(workspaceEdit, editor, finalLoc, textToInsert)
}
