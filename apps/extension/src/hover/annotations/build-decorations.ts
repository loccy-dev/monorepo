import { repeat } from 'lodash'
import * as vscode from 'vscode'
import { NON_BREAKING_SPACE } from '../../helpers/helpers'
import type { KeypathInfo } from '@repo/types/framework.types'
import { ModuleView, resourceService } from '../../helpers/resource-service'
import { usageService } from '../../helpers/usage-service'
import {
  buildDynamicHoverMessage,
  buildDynamicPreviewContentText,
  buildHoverMessage,
  buildPluralHoverMessage,
  buildValuePluralHoverMessage,
  renderTranslationPreviewForKeypath,
} from './hover-message'

const DECORATION_MARGIN_FROM_TEXT = '1.5em'

export const transparentDecorationType = vscode.window.createTextEditorDecorationType({})

export const previewDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    color: { id: 'loccy.annotation' },
    margin: `0 0 0 ${DECORATION_MARGIN_FROM_TEXT}`,
    contentText: '', // translation preview (placeholder, set dynamically)
  },
})

export function buildDecorations(
  editor: vscode.TextEditor,
  ranges: KeypathInfo[],
  showTranslationPreview: boolean,
  view: ModuleView | undefined,
): { inline: vscode.DecorationOptions[]; preview: vscode.DecorationOptions[] } {
  if (!view) {
    return {
      inline: [],
      preview: [],
    }
  }

  const text = editor.document.getText()
  const lines = text.split('\n')

  const inline: vscode.DecorationOptions[] = []
  const preview: vscode.DecorationOptions[] = []

  for (let i = 0; i < ranges.length; i++) {
    const keypathRange = ranges[i]
    const keypath = keypathRange.keypaths[0]
    if (!keypath) {
      continue
    }

    // a usage may belong to a different module than the file's default (mixed-framework file)
    const rangeView = (keypathRange.module && resourceService.view(keypathRange.module)) || view
    const allLocales = rangeView.allLocales
    if (!allLocales.length) {
      continue
    }

    const flatTranslationsPerKeypath = rangeView.getFlatTranslationsPerKeypath(keypathRange.ns)

    const keypathStartPos = editor.document.positionAt(keypathRange.loc.start)
    const keypathEndPos = editor.document.positionAt(keypathRange.loc.end)
    const lineEndPos = new vscode.Position(keypathStartPos.line, lines[keypathStartPos.line].length)
    const keypathInlineRange = new vscode.Range(keypathStartPos, keypathEndPos)
    const keypathLineEndRange = new vscode.Range(lineEndPos, lineEndPos)
    const usageMap = usageService.getPerKeypath(keypathRange.ns)

    const buildUsages = (keypath: string) => {
      const allUsagesOfKeypath = usageMap.get(keypath) ?? new Map<string, KeypathInfo[]>()
      return [...allUsagesOfKeypath.entries()].flatMap(([uri, keyInfos]) =>
        keyInfos.map((keyInfo: KeypathInfo) => ({
          uri: vscode.Uri.parse(uri),
          loc: keyInfo.loc,
        })),
      )
    }

    let infoHoverMessage: vscode.MarkdownString
    let previewContentText = ''

    if (keypathRange.type === 'dynamic-defined' && keypathRange.keypaths.length > 1) {
      infoHoverMessage = buildDynamicHoverMessage(
        keypathRange.keypaths,
        flatTranslationsPerKeypath,
        keypathRange.loc,
        allLocales,
        buildUsages,
        { uri: editor.document.uri, loc: keypathRange.loc },
        keypathRange.ns,
        keypathRange.prefix,
        rangeView.name,
      )

      if (showTranslationPreview) {
        previewContentText = buildDynamicPreviewContentText(keypathRange, rangeView.name)
      }
    } else if (keypathRange.type === 'plurals' && rangeView.messageFormat.valueCodec) {
      // value-locus format (icu/vue): one key, plural lives in the value — show per-locale
      // value with missing-branch warnings, not sibling-key sections.
      const translationsForKey = flatTranslationsPerKeypath[keypath] ?? {}
      const allKeypathTranslationsFormatted = Object.fromEntries(
        allLocales.map((locale) => [locale, translationsForKey[locale] ?? '']),
      )
      infoHoverMessage = buildValuePluralHoverMessage(
        keypath,
        allKeypathTranslationsFormatted,
        keypathRange.loc,
        buildUsages(keypath),
        { uri: editor.document.uri, loc: keypathRange.loc },
        rangeView.messageFormat,
        keypathRange.ns,
        keypathRange.prefix,
        keypathRange.ordinal,
        rangeView.name,
      )

      if (showTranslationPreview) {
        previewContentText = renderTranslationPreviewForKeypath(
          {
            ...keypathRange,
            keypaths: [keypath],
            content: keypath,
          },
          rangeView.name,
        )
      }
    } else if (keypathRange.type === 'plurals') {
      infoHoverMessage = buildPluralHoverMessage(
        keypathRange.keypaths,
        flatTranslationsPerKeypath,
        keypathRange.loc,
        allLocales,
        buildUsages,
        { uri: editor.document.uri, loc: keypathRange.loc },
        keypathRange.ns,
        keypathRange.prefix,
        keypathRange.ordinal,
        rangeView.name,
      )

      if (showTranslationPreview) {
        previewContentText = buildDynamicPreviewContentText(keypathRange, rangeView.name)
      }
    } else {
      const translationsForKey = flatTranslationsPerKeypath[keypath] ?? {}
      const allKeypathTranslationsFormatted = Object.fromEntries(
        allLocales.map((locale) => [locale, translationsForKey[locale] ?? '']),
      )
      infoHoverMessage = buildHoverMessage(
        keypath,
        allKeypathTranslationsFormatted,
        keypathRange.loc,
        buildUsages(keypath),
        { uri: editor.document.uri, loc: keypathRange.loc },
        keypathRange.ns,
        keypathRange.prefix,
        rangeView.name,
      )

      if (showTranslationPreview) {
        previewContentText = renderTranslationPreviewForKeypath(
          {
            ...keypathRange,
            keypaths: [keypath],
            content: keypath,
          },
          rangeView.name,
        )
      }
    }

    inline.push({
      range: keypathInlineRange,
      hoverMessage: infoHoverMessage,
    })

    if (showTranslationPreview) {
      preview.push({
        range: keypathLineEndRange,
        hoverMessage: infoHoverMessage,
        renderOptions: {
          after: {
            contentText: previewContentText,
          },
        },
      })
    }
  }

  // combine same-line annotations manually to force proper order
  const previewByLine = new Map<number, vscode.DecorationOptions[]>()
  for (const annotation of preview) {
    const line = annotation.range.start.line
    if (!previewByLine.has(line)) {
      previewByLine.set(line, [])
    }
    previewByLine.get(line)!.push(annotation)
  }

  const combinedPreviewAnnotations: vscode.DecorationOptions[] = []
  for (const [line, annotations] of previewByLine) {
    if (annotations.length === 1) {
      combinedPreviewAnnotations.push(annotations[0])
    } else {
      const combinedText = annotations
        .map((a) => a.renderOptions?.after?.contentText)
        .filter(Boolean)
        .join(repeat(NON_BREAKING_SPACE, 3))

      combinedPreviewAnnotations.push({
        range: annotations[0].range,
        hoverMessage: annotations[0].hoverMessage,
        renderOptions: {
          after: {
            contentText: combinedText,
          },
        },
      })
    }
  }

  return {
    inline,
    preview: combinedPreviewAnnotations,
  }
}
