import * as vscode from 'vscode'
import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { resourceService } from '../../helpers/resource-service'
import { buildDecorations, transparentDecorationType } from './build-decorations'
import { debounce } from 'lodash'
import { ANNOTATIONS_DEBOUNCE_DELAY } from '../../config'
import { getResourceFormatByExt } from '@repo/shared/core/registry'

const RENDER_AREA_LINES_FROM_CURSOR = 50

export async function updateTranslationAnnotations(editor: vscode.TextEditor) {
  const cursorLine = editor.selection.active.line
  const startLine = Math.max(0, cursorLine - RENDER_AREA_LINES_FROM_CURSOR)
  const endLine = cursorLine + RENDER_AREA_LINES_FROM_CURSOR

  const text = editor.document.getText()
  // format-agnostic: each resource format reports its own keypath positions (json/yaml/php/…)
  const ext = editor.document.uri.path.split('.').pop() ?? ''
  const keypathRanges = getResourceFormatByExt(ext)?.keypathRanges?.(text) ?? []
  const ranges: KeypathInfo[] = keypathRanges.map(({ keypath, loc }) => ({
    content: keypath,
    loc,
    ns: resourceService.getResourceFileNs(editor.document.uri) ?? NS_WITHOUT_NS,
    keypaths: [keypath],
    type: 'static',
  }))

  const filteredRanges = ranges.filter((range) => {
    const position = editor.document.positionAt(range.loc.start)
    return position.line >= startLine && position.line <= endLine
  })

  // resource file → its owning module (by translations glob), so annotations use that module's data
  const view = resourceService.resolveView({ translationFileUri: editor.document.uri })
  const { inline } = buildDecorations(editor, filteredRanges, false, view)
  editor.setDecorations(transparentDecorationType, inline)
}

export const updateTranslationAnnotationsDebounced = debounce(updateTranslationAnnotations, ANNOTATIONS_DEBOUNCE_DELAY)
