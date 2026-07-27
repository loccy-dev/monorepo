import * as vscode from 'vscode'
import { InsertTFunctionProps } from '../../types'
import { collectChangesToReplaceFromTo } from '../../helpers/workspace-edit'
import { getFramework } from '@repo/shared/core/registry'
import type { I18nFrameworkId } from '@repo/types/framework.types'

// Insertion for frameworks whose code is neither JSX nor Vue templates (laravel PHP, spring Java):
// emit the framework's own call text with no interpolation wrap, replacing the selection (optionally
// eating the surrounding quotes of a replaced string literal).
export async function insertTFunctionPlain(
  frameworkId: I18nFrameworkId,
  workspaceEdit: vscode.WorkspaceEdit,
  props: InsertTFunctionProps,
): Promise<void> {
  const { loc, keypath, tFunctionInfo, eraseQuotes, cleanSrcText, params, quoteType, count } = props

  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return
  }
  const docText = editor.document.getText()

  const textToInsert = getFramework(frameworkId)!.ideInsert!.insertTFunctionText({
    tFunctionInfo,
    keypath,
    params,
    quoteType,
    count,
  })

  let finalLoc = loc
  if (eraseQuotes) {
    const locationContent = docText.slice(loc.start, loc.end).trim()
    const isSelectionWithQuotes = !!cleanSrcText && locationContent.slice(1, -1) === cleanSrcText

    const symbolBefore = docText.slice(loc.start - 1, loc.start)
    const symbolAfter = docText.slice(loc.end, loc.end + 1)
    const isSelectionBetweenAngleBrackets = symbolBefore === '>' || symbolAfter === '<'

    if (!isSelectionBetweenAngleBrackets && !isSelectionWithQuotes) {
      finalLoc = { ...finalLoc, start: finalLoc.start - 1, end: finalLoc.end + 1 }
    }
  }

  await collectChangesToReplaceFromTo(workspaceEdit, editor, finalLoc, textToInsert)
}
