import * as vscode from 'vscode'
import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { getResourceFormatByExt } from '@repo/shared/core/registry'
import { getKeyRanges } from '../editor-integration/frameworks/get-key-ranges'
import { fileResolver, FileType } from './file-resolver'
import { resourceService } from './resource-service'
import { usageService } from './usage-service'

/** Keys a resource file declares itself, positioned by that format's own parser. */
export function getResourceKeypathInfos(document: vscode.TextDocument): KeypathInfo[] {
  const ext = document.uri.path.split('.').pop() ?? ''
  const keypathRanges = getResourceFormatByExt(ext)?.keypathRanges?.(document.getText()) ?? []
  const ns = resourceService.getResourceFileNs(document.uri) ?? NS_WITHOUT_NS

  return keypathRanges.map(({ keypath, loc }) => ({
    content: keypath,
    loc,
    ns,
    keypaths: [keypath],
    type: 'static',
  }))
}

/** Keys used in a source file. Falls back to a direct parse while the workspace scan is still running. */
async function getSourceKeypathInfos(document: vscode.TextDocument): Promise<KeypathInfo[]> {
  if (usageService.initialized) {
    const pendingParse = usageService.documentParsePromises.get(document.uri.toString())
    if (pendingParse) {
      try {
        await pendingParse
      } catch {
        return getKeyRanges(document.getText(), document.uri)
      }
    }
    return usageService.perFile.get(document.uri.toString()) ?? []
  }

  return getKeyRanges(document.getText(), document.uri)
}

/** The key the cursor sits in, else the closest one on the same line. */
export async function resolveKeypathAtCursor(): Promise<KeypathInfo | undefined> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    return undefined
  }

  const fileType = fileResolver.checkFileType(editor.document.uri)
  let keypathInfos: KeypathInfo[] = []

  if (fileType === FileType.Resource) {
    keypathInfos = getResourceKeypathInfos(editor.document)
  } else if (fileType === FileType.Source) {
    keypathInfos = await getSourceKeypathInfos(editor.document)
  }

  const cursorOffset = editor.document.offsetAt(editor.selection.active)
  const atCursor = keypathInfos.find(({ loc }) => cursorOffset >= loc.start && cursorOffset <= loc.end)
  if (atCursor) {
    return atCursor
  }

  const cursorLine = editor.selection.active.line
  const sameLine = keypathInfos.filter(({ loc }) => editor.document.positionAt(loc.start).line === cursorLine)

  return sameLine.reduce<KeypathInfo | undefined>((closest, keypathInfo) => {
    if (!closest) {
      return keypathInfo
    }
    return Math.abs(keypathInfo.loc.start - cursorOffset) < Math.abs(closest.loc.start - cursorOffset)
      ? keypathInfo
      : closest
  }, undefined)
}
