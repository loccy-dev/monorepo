import * as vscode from 'vscode'
import type { Loc } from '@repo/types/platform.types'
import { usageService } from '../helpers/usage-service'
import { updateAnnotations } from './annotations'
import { handleError } from '../helpers/error-handler'
import { fileResolver } from '../helpers/file-resolver'
import { getKeyRanges } from '../editor-integration/frameworks/get-key-ranges'
import { cfg } from '../global-config'

export type CmdOpenLocArgs = {
  stringifiedUri: string
  loc: Loc
}

export async function openLocCmd(context: vscode.ExtensionContext, { stringifiedUri, loc }: CmdOpenLocArgs) {
  try {
    const uri = vscode.Uri.parse(stringifiedUri)
    const doc = await vscode.workspace.openTextDocument(uri)
    const { start, end } = loc

    try {
      await vscode.workspace.fs.stat(uri)
    } catch (statError) {
      showErrorAndReinit(context, "File doesn't exist or can't be accessed")
      return
    }

    const docText = doc.getText()
    const keypathRanges = await getKeyRanges(docText, doc.uri)
    if (!keypathRanges.some((r) => r.loc.start === start && r.loc.end === end)) {
      showErrorAndReinit(context, 'Keypath with that position not found.')
      return
    }

    const startPosition = doc.positionAt(start)
    const endPosition = doc.positionAt(end)
    const range = new vscode.Range(startPosition, endPosition)
    const editor = await vscode.window.showTextDocument(doc)
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter)
    editor.selection = new vscode.Selection(startPosition, endPosition)
  } catch (e: any) {
    // file could be deleted externally
    showErrorAndReinit(context, 'Cannot open file', e)
  }
}

async function showErrorAndReinit(context: vscode.ExtensionContext, internal: string, e?: any) {
  handleError({ snackbar: "Doesn't exist anymore. Reindexing...", internal, e })

  usageService.initialized = false
  updateAnnotations()

  await fileResolver.init(
    cfg.resourceGlobs.include,
    cfg.resourceGlobs.exclude,
    cfg.usageGlobs.include,
    cfg.usageGlobs.exclude,
  )
  await usageService.init()

  updateAnnotations()
}
