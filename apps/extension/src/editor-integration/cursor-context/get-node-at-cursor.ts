import * as vscode from 'vscode'
import { BaseNode, NodeTraverseError, NodeTraverseResult } from '../../types'
import { getLineIndex } from '@repo/shared/core/helpers/helpers'
import { isValidStringBounds } from '../../helpers/is-valid-string-bounds'
import { textBoundaryDetector } from '../../helpers/text-boundary-detector'
import { CursorContextReact } from './react/cursor-context-react.types'
import { detectCursorContextReact } from './react/detect-cursor-context-react'
import { CursorContextVue } from './vue/cursor-context-vue.types'
import { detectCursorContextVue } from './vue/detect-cursor-context-vue'
import { codeFamilyForExt } from '.'
import { extractFileExt } from '@repo/shared/core/helpers/path.helpers'

export function getNodeAtCursor(): NodeTraverseResult {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return { node: null, error: NodeTraverseError.NoActiveEditor }
  }
  const docText = editor.document.getText()
  const cursorStart = editor.document.offsetAt(editor.selection.start)
  const cursorEnd = editor.document.offsetAt(editor.selection.end)

  // user selection
  if (cursorStart !== cursorEnd) {
    return {
      node: {
        loc: {
          start: cursorStart,
          end: cursorEnd,
          line: getLineIndex(docText, cursorStart),
        },
        value: docText.slice(cursorStart, cursorEnd),
      },
      error: null,
    }
  }

  const codeFamily = codeFamilyForExt(extractFileExt(editor.document.uri.path))
  let ignoreWhitespaces = false
  if (codeFamily === 'vue' && detectCursorContextVue(docText, cursorStart) === CursorContextVue.TEMPLATE_TAG) {
    ignoreWhitespaces = true
  } else if (
    codeFamily === 'react' &&
    detectCursorContextReact(docText, cursorStart) === CursorContextReact.JSX_ELEMENT_CONTENT
  ) {
    ignoreWhitespaces = true
  }

  const bounds = textBoundaryDetector.findBounds(docText, cursorStart, ignoreWhitespaces)

  if (!bounds.text) {
    return {
      node: null,
      error: NodeTraverseError.SelectManually,
    }
  }

  if (!isValidStringBounds(docText, bounds)) {
    return {
      node: null,
      error: NodeTraverseError.NotFound,
    }
  }

  const result: BaseNode = {
    loc: {
      ...bounds,
      line: getLineIndex(docText, bounds.start),
    },
    value: bounds.text,
  }
  return {
    node: result,
    error: null,
  }
}
