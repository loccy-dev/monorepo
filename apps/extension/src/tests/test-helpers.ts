import * as vscode from 'vscode'
import assert from 'assert'
import { getLineIndex } from '@repo/shared/core/helpers/helpers'
import type { Loc } from '@repo/types/platform.types'
import type { Namespace } from '@repo/types/primitives.types'
import type { KeypathInfo } from '@repo/types/framework.types'
import { extractParams } from '../helpers/extract-params'
import { insertTFunction } from '../editor-integration/frameworks/insert-t-function'
import { getTFunctions } from '../editor-integration/frameworks/get-t-functions'
import { getNodeAtCursor } from '../editor-integration/cursor-context/get-node-at-cursor'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'

let untitledSeq = 0
/** Open an untitled doc carrying a real file extension (so extension-based detection works in the
 *  headless test host, where the `language` option is ignored) and seed its content. */
export async function openUntitledDoc(content: string, ext: string): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`untitled:loccy-test-${untitledSeq++}.${ext}`))
  const editor = await vscode.window.showTextDocument(doc)
  await editor.edit((e) => e.insert(new vscode.Position(0, 0), content))
  return editor
}

export const TEST_KEY_NAME = 'my.key'

export function fillMissingData(
  ranges: Array<
    Omit<KeypathInfo, 'loc' | 'ns' | 'keypaths' | 'type' | 'ordinal'> & {
      loc: Omit<Loc, 'line'>
      ns?: Namespace
      keypaths?: string[]
      type?: KeypathInfo['type']
      ordinal?: KeypathInfo['ordinal']
    }
  >,
  content: string,
  globalDefaults?: {
    ns?: Namespace
    type?: KeypathInfo['type']
    ordinal?: KeypathInfo['ordinal']
  },
): KeypathInfo[] {
  return ranges.map((r) => {
    const locWithLine = {
      ...r.loc,
      line: getLineIndex(content, r.loc.start),
    }

    // const extractedContent = extractLiteralWithQuotes(content, r.loc.start, r.loc.end)
    const keypaths = r.keypaths ?? [r.content]
    const ns = r.ns ?? globalDefaults?.ns ?? NS_WITHOUT_NS
    const type = r.type ?? globalDefaults?.type ?? 'static'
    const ordinal = r.ordinal ?? globalDefaults?.ordinal ?? undefined

    return {
      ...r,
      ns,
      loc: locWithLine,
      prefix: r.prefix,
      keypaths,
      type,
      ordinal,
    }
  }) as KeypathInfo[]
}

export function assertRange(start: number, end: number, fn: (pos: number) => any, expectedVal: any) {
  for (let i = start; i <= end; i++) {
    const result = fn(i)
    assert.deepEqual(result, expectedVal)
  }
}

export async function testInsertion(
  editor: vscode.TextEditor,
  originalContent: string,
  location: { start: number; end: number },
  expectedContent: string,
  checkOuterSelection = false,
  fileExt = 'txt',
) {
  const resetContent = async () => {
    await editor.edit((editBuilder) => {
      const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0)
      editBuilder.replace(fullRange, originalContent)
    })
  }

  const tInfos = getTFunctions(editor.document.getText(), fileExt, location.start, editor.document.uri)

  // 1 - cursor point

  const startPos = editor.document.positionAt(location.start)
  editor.selection = new vscode.Selection(startPos, startPos)
  const node = getNodeAtCursor()
  const srcText = extractParams(node.node!.value!)

  const workspaceEdit1 = new vscode.WorkspaceEdit()
  await insertTFunction(
    workspaceEdit1,
    {
      loc: node.node!.loc,
      keypath: TEST_KEY_NAME,
      tFunctionInfo: tInfos[0],
      eraseQuotes: true,
      params: srcText.params,
    },
    editor.document.uri,
  )
  await vscode.workspace.applyEdit(workspaceEdit1)
  assert.equal(editor.document.getText(), expectedContent)
  await resetContent()

  // 2 - selection from start to end

  const startPos2 = editor.document.positionAt(location.start)
  const endPos2 = editor.document.positionAt(location.end)
  editor.selection = new vscode.Selection(startPos2, endPos2)
  const node2 = getNodeAtCursor()
  const srcText2 = extractParams(node2.node!.value!)

  const workspaceEdit2 = new vscode.WorkspaceEdit()
  await insertTFunction(
    workspaceEdit2,
    {
      loc: node2.node!.loc,
      keypath: TEST_KEY_NAME,
      tFunctionInfo: tInfos[0],
      eraseQuotes: true,
      params: srcText2.params,
    },
    editor.document.uri,
  )
  await vscode.workspace.applyEdit(workspaceEdit2)
  assert.equal(editor.document.getText(), expectedContent)
  await resetContent()

  // 3 - selection from start to end, but including quotes
  const startPos3 = editor.document.positionAt(location.start - 1)
  const endPos3 = editor.document.positionAt(location.end + 1)
  editor.selection = new vscode.Selection(startPos3, endPos3)
  const node3 = getNodeAtCursor()
  const srcText3 = extractParams(node3.node!.value!)

  if (checkOuterSelection) {
    const workspaceEdit3 = new vscode.WorkspaceEdit()
    await insertTFunction(
      workspaceEdit3,
      {
        loc: node3.node!.loc,
        keypath: TEST_KEY_NAME,
        tFunctionInfo: tInfos[0],
        eraseQuotes: true,
        cleanSrcText: originalContent.slice(location.start, location.end),
        params: srcText3.params,
      },
      editor.document.uri,
    )
    await vscode.workspace.applyEdit(workspaceEdit3)
    assert.equal(editor.document.getText(), expectedContent)
    await resetContent()
  }
}
