// NOTE: only place where default icons used. Apparently vscode has bug with custom icons in hover messages — layout
// sometimes breaks a bit on first hover.

import { repeat } from 'lodash'
import * as vscode from 'vscode'
import { cfg } from '../../global-config'
import { NON_BREAKING_SPACE, sortLocalizedText } from '../../helpers/helpers'
import { resourceService } from '../../helpers/resource-service'
import { usageService } from '../../helpers/usage-service'
import type { Loc } from '@repo/types/platform.types'
import type { KeypathInfo } from '@repo/types/framework.types'
import type { LocalizedText, Locale, Namespace } from '@repo/types/primitives.types'
import { partialOverridesOf } from '@repo/types/config.types'
import { CmdActionsWithTranslationsArgs } from '../actions-with-translations-cmd'
import { resolveMessageReferences } from '../../editor-integration/frameworks/resolve-message-references'
import { CmdEditTranslationArgs } from '../edit-translation-cmd'
import { getPluralCategories, PLURAL_CATEGORIES } from '@repo/shared/core/plurals/plural-categories'
import { missingValuePluralCategories } from '@repo/shared/core/plurals/validate-plural'
import type { PluralCategory, PluralNumberType } from '@repo/types/plurals.types'
import type { MessageFormat } from '@repo/shared/core/contracts'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { s } from '@repo/shared/core/helpers/helpers'
import { extractFileName } from '@repo/shared/core/helpers/path.helpers'

const TEXT_SECONDARY_COLOR = '#7F848E'
const TEXT_WARNING_COLOR = 'var(--vscode-editorWarning-foreground)'

function extractPluralSuffix(keypath: string): PluralCategory | null {
  for (const suffix of PLURAL_CATEGORIES) {
    if (keypath.endsWith(`_${suffix}`)) {
      return suffix
    }
  }
  return null
}

const MAX_DYNAMIC_HOVER_ITEMS = 20
const TOTAL_COLS = 2

/** Resolve the module's view for a hover (named module, else the primary module). */
function viewFor(moduleName?: string) {
  return (moduleName ? resourceService.view(moduleName) : undefined) ?? resourceService.primaryView()
}

export function buildHoverMessage(
  keypath: string,
  allTranslations: Record<string, string>,
  loc: Loc,
  allUsages: { uri: vscode.Uri; loc: Loc }[],
  currentLocation: { uri: vscode.Uri; loc: Loc },
  namespace?: string,
  prefix?: string,
  moduleName?: string,
) {
  const parts = [
    renderKeypath(keypath, namespace, prefix),
    renderTranslations(allTranslations, keypath, loc, namespace, moduleName),
    renderUsages(allUsages, currentLocation, true, moduleName),
  ]

  const htmlContent = `<table>${parts.map((p) => p.trim()).join('')}</table>`

  const markdownHoverMessage = new vscode.MarkdownString(`${htmlContent.trim()}`, true)
  markdownHoverMessage.isTrusted = true
  markdownHoverMessage.supportHtml = true
  return markdownHoverMessage
}

export function buildDynamicPreviewContentText(keypathInfo: KeypathInfo, moduleName?: string): string {
  const options = keypathInfo.keypaths
  if (!options.length) {
    return ''
  }

  const truncate = keypathInfo.keypaths.length > MAX_DYNAMIC_HOVER_ITEMS
  const displayedKeypaths = truncate ? keypathInfo.keypaths.slice(0, MAX_DYNAMIC_HOVER_ITEMS) : keypathInfo.keypaths
  const remainingCount = truncate ? keypathInfo.keypaths.length - displayedKeypaths.length : 0
  const previewItems = displayedKeypaths.map((keypath) => {
    return renderTranslationPreviewForKeypath({ ...keypathInfo, keypaths: [keypath], content: keypath }, moduleName)
  })
  const spacesCount = 2
  let previewCore =
    `${previewItems.join(`${repeat(NON_BREAKING_SPACE, spacesCount)}|${repeat(NON_BREAKING_SPACE, spacesCount)}`)}`.trim()
  if (remainingCount) {
    previewCore += `${repeat(NON_BREAKING_SPACE, spacesCount)}|${repeat(NON_BREAKING_SPACE, spacesCount)}and ${remainingCount} more...`
  }

  return `${previewCore}`.trim()
}

export function buildDynamicHoverMessage(
  keypaths: string[],
  flatTranslationsPerKeypath: Record<string, LocalizedText>,
  loc: Loc,
  allLocales: Locale[],
  buildUsages: (keypath: string) => { uri: vscode.Uri; loc: Loc }[],
  currentLocation: { uri: vscode.Uri; loc: Loc },
  namespace?: string,
  prefix?: string,
  moduleName?: string,
) {
  const totalOptions = keypaths.length
  const header = renderDynamicHeader(totalOptions)

  const truncate = totalOptions > MAX_DYNAMIC_HOVER_ITEMS
  const displayedKeypaths = truncate ? keypaths.slice(0, MAX_DYNAMIC_HOVER_ITEMS) : keypaths
  const remainingCount = truncate ? totalOptions - displayedKeypaths.length : 0

  const sections =
    totalOptions > 0
      ? [
          displayedKeypaths
            .map((keypath) => {
              const translations = flatTranslationsPerKeypath[keypath] ?? {}
              const localizedText = Object.fromEntries(allLocales.map((locale) => [locale, translations[locale] ?? '']))
              return `
        ${renderEmptyLine()}
        ${renderKeypath(keypath, namespace, prefix, false)}
        ${renderTranslations(localizedText, keypath, loc, namespace, moduleName)}
        ${renderUsages(buildUsages(keypath), currentLocation, false, moduleName)}
      `.trim()
            })
            .join(`${renderEmptyLine()}${renderDivider()}`),
          remainingCount > 0
            ? `${renderEmptyLine()}${renderDivider()}${renderEmptyLine()}${renderDynamicOverflowFooter(remainingCount)}`
            : '',
        ]
          .filter(Boolean)
          .join('')
      : `
        ${renderEmptyLine()}
        <tr>
          <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_SECONDARY_COLOR};">No matching keys found</span></td>
        </tr>
        ${renderEmptyLine()}
      `.trim()

  const htmlContent = `<table>${[header, sections].filter(Boolean).join('')}</table>`
  const markdownHoverMessage = new vscode.MarkdownString(`${htmlContent.trim()}`, true)
  markdownHoverMessage.isTrusted = true
  markdownHoverMessage.supportHtml = true
  return markdownHoverMessage
}

function renderDynamicHeader(optionCount: number) {
  const label = `${optionCount} matching keypath${s(optionCount)}`
  return `
    <tr>
      <td colspan="${TOTAL_COLS}"><span>${label}</span></td>
    </tr>
    ${renderDivider()}
    ${renderEmptyLine()}
  `.trim()
}

export function buildPluralHoverMessage(
  keypaths: string[],
  flatTranslationsPerKeypath: Record<string, LocalizedText>,
  loc: Loc,
  allLocales: Locale[],
  buildUsages: (keypath: string) => { uri: vscode.Uri; loc: Loc }[],
  currentLocation: { uri: vscode.Uri; loc: Loc },
  namespace?: string,
  prefix?: string,
  ordinal?: boolean,
  moduleName?: string,
) {
  const totalOptions = keypaths.length
  const header = renderDynamicHeader(totalOptions)

  const truncate = totalOptions > MAX_DYNAMIC_HOVER_ITEMS
  const displayedKeypaths = truncate ? keypaths.slice(0, MAX_DYNAMIC_HOVER_ITEMS) : keypaths
  const remainingCount = truncate ? totalOptions - displayedKeypaths.length : 0

  const missingMessage = ordinal ? 'Missing ordinal form for this locale' : 'Missing plural form for this locale'

  const sections =
    totalOptions > 0
      ? [
          displayedKeypaths
            .map((keypath) => {
              const translations = flatTranslationsPerKeypath[keypath] ?? {}

              // filter locales to only those that need this plural suffix
              // _zero is special: show all locales but without warning (it's usually optional)
              const suffix = extractPluralSuffix(keypath)
              const isZeroSuffix = suffix === 'zero'
              const relevantLocales =
                suffix && !isZeroSuffix
                  ? allLocales.filter((locale) =>
                      getPluralCategories([locale], ordinal ? 'ordinal' : 'cardinal').includes(suffix),
                    )
                  : allLocales

              const localizedText = Object.fromEntries(
                relevantLocales.map((locale) => [locale, translations[locale] ?? '']),
              )
              const placeholder = isZeroSuffix
                ? undefined
                : `<span style="color:${TEXT_WARNING_COLOR};">$(alert) ${missingMessage}</span>`
              return `
        ${renderEmptyLine()}
        ${renderKeypath(keypath, namespace, prefix, false)}
        ${renderTranslations(localizedText, keypath, loc, namespace, moduleName, placeholder)}
        ${renderUsages(buildUsages(keypath), currentLocation, false, moduleName)}
      `.trim()
            })
            .join(`${renderEmptyLine()}${renderDivider()}`),
          remainingCount > 0
            ? `${renderEmptyLine()}${renderDivider()}${renderEmptyLine()}${renderDynamicOverflowFooter(remainingCount)}`
            : '',
        ]
          .filter(Boolean)
          .join('')
      : `
        ${renderEmptyLine()}
        <tr>
          <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_SECONDARY_COLOR};">No matching keys found</span></td>
        </tr>
        ${renderEmptyLine()}
      `.trim()

  const htmlContent = `<table>${[header, sections].filter(Boolean).join('')}</table>`
  const markdownHoverMessage = new vscode.MarkdownString(`${htmlContent.trim()}`, true)
  markdownHoverMessage.isTrusted = true
  markdownHoverMessage.supportHtml = true
  return markdownHoverMessage
}

/**
 * Hover for a VALUE-LOCUS plural (icu/vue) — single key, plural lives in the value.
 * Value-locus counterpart to `buildPluralHoverMessage`'s per-sibling-key rendering.
 */
export function buildValuePluralHoverMessage(
  keypath: string,
  translations: LocalizedText,
  loc: Loc,
  allUsages: { uri: vscode.Uri; loc: Loc }[],
  currentLocation: { uri: vscode.Uri; loc: Loc },
  messageFormat: MessageFormat,
  namespace?: string,
  prefix?: string,
  ordinal?: boolean,
  moduleName?: string,
) {
  const numberType: PluralNumberType = ordinal ? 'ordinal' : 'cardinal'
  const rows = Object.entries(translations)
    .map(([locale, value]) => {
      const displayValue = value
        ? resolveMessageReferences(value, locale, namespace ?? NS_WITHOUT_NS, moduleName)
        : value
      const missing = missingValuePluralCategories(value, locale, messageFormat, numberType)
      const warning = missing.length
        ? `${nSpaces(1)}<span style="color:${TEXT_WARNING_COLOR};">$(alert) missing: ${missing.join(', ')}</span>`
        : ''
      const cell = displayValue
        ? `${escapeHtml(displayValue)}${warning}`
        : `<span style="color:${TEXT_WARNING_COLOR};">$(alert) Missing plural for this locale</span>`
      // ⚠️ keep in sync with TOTAL_COLS
      return `
        <tr>
          <td>${editTranslationIconAction({ keypath, locale, loc, namespace })}${nSpaces(2)}<code>${locale.replaceAll('-', nonBreakingHyphen())}</code>${nSpaces(1)}${cell}</td>
          <td></td>
        </tr>
      `.trim()
    })
    .join('')

  const parts = [
    renderKeypath(keypath, namespace, prefix),
    rows,
    renderUsages(allUsages, currentLocation, true, moduleName),
  ]
  const markdownHoverMessage = new vscode.MarkdownString(`<table>${parts.map((p) => p.trim()).join('')}</table>`, true)
  markdownHoverMessage.isTrusted = true
  markdownHoverMessage.supportHtml = true
  return markdownHoverMessage
}

function renderKeypath(keypath: string, namespace?: Namespace, prefix?: string, divide = true) {
  // ⚠️ keep in sync with TOTAL_COLS
  return `
    <tr>
      <td><span style="color:${TEXT_SECONDARY_COLOR};">$(key) ${keypath}</span></td>
      <td align="right">${moreActionsIconAction({ keypath, namespace, prefix })}</td>
    </tr>${divide ? renderDivider() : ''}
    ${renderEmptyLine()}
  `.trim()
}

function renderTranslations(
  translations: LocalizedText,
  keypath: string,
  loc: Loc,
  namespace?: Namespace,
  moduleName?: string,
  placeholder?: string,
) {
  return Object.entries(translations)
    .map(([locale, value]) => {
      const displayValue = value
        ? resolveMessageReferences(value, locale, namespace ?? NS_WITHOUT_NS, moduleName)
        : value
      // ⚠️ keep in sync with TOTAL_COLS
      return `
        <tr>
          <td>${editTranslationIconAction({ keypath, locale, loc, namespace })}${nSpaces(2)}<code>${locale.replaceAll('-', nonBreakingHyphen())}</code>${nSpaces(1)}${displayValue ? escapeHtml(displayValue) : (placeholder ?? `<span style="color:${TEXT_SECONDARY_COLOR};">–</span>`)}</td>
          <td></td>
        </tr>
      `.trim()
    })
    .join('')
}

/** Whether the module scans any source globs for usages (vs. a translations-only module). */
function usagesConfigured(moduleName?: string): boolean {
  const view = viewFor(moduleName)
  return !!view && view.module.usages.include.length > 0
}

function renderUsages(
  usages: { uri: vscode.Uri; loc: Loc }[],
  currentLocation: { uri: vscode.Uri; loc: Loc },
  divide = true,
  moduleName?: string,
) {
  const isCurrent = (usage: { uri: vscode.Uri; loc: Loc }) => {
    return (
      usage.uri.path === currentLocation.uri.path &&
      usage.loc.end === currentLocation.loc.end &&
      usage.loc.start === currentLocation.loc.start
    )
  }

  usages.sort((a, b) => {
    if (a.uri.path === b.uri.path) {
      return a.loc.start - b.loc.start
    }
    const aFilename = extractFileName(a.uri.path, true)
    const bFilename = extractFileName(b.uri.path, true)
    return aFilename.localeCompare(bFilename)
  })

  const maybeDivider = divide ? renderDivider() : ''

  // Translations-only module (no source globs): skip "Loading…" state, show config link instead.
  if (!usagesConfigured(moduleName)) {
    const configureLink = `<a href="${renderCmdHref('openConfig', {})}">Configure</a>`
    return `
      ${maybeDivider}
      ${renderEmptyLine()}
      <tr>
        <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_SECONDARY_COLOR};">No usages configured</span>${nSpaces(2)}${configureLink}</td>
      </tr>
    `.trim()
  }

  if (!usageService.initialized) {
    return `
      ${maybeDivider}
      ${renderEmptyLine()}
      <tr>
        <td colspan="${TOTAL_COLS}">Loading usages...</td>
      </tr>
    `.trim()
  } else if (usages.length) {
    const label = `${usages.length} usage${s(usages.length)}`
    return `
      ${maybeDivider}
      ${renderEmptyLine()}
      <tr>
        <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_SECONDARY_COLOR};">${label}</span></td>
      </tr>
      ${usages.map((u) => renderUsage(u, isCurrent(u))).join('')}
    `.trim()
  } else {
    return `
      ${maybeDivider}
      ${renderEmptyLine()}
      <tr>
        <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_WARNING_COLOR};">$(alert) No usages found</span></td>
      </tr>
    `.trim()
  }
}

function renderUsage(usage: { uri: vscode.Uri; loc: Loc }, isCurrent: boolean) {
  const fullPath = vscode.workspace.asRelativePath(usage.uri)
  const href = renderCmdHref('openLoc', { stringifiedUri: usage.uri.toString(), loc: usage.loc })
  const file = truncateFilename(vscode.workspace.asRelativePath(usage.uri))
  const line = usage.loc.line! + 1

  return `
      <tr>
        <td colspan="${TOTAL_COLS}">
          <a href="${href}" title="${fullPath}">$(file-code)${nSpaces(1)}${file}:${line}</a>${
            isCurrent
              ? `<span title="You are here" style="color:${TEXT_SECONDARY_COLOR};">${nSpaces(1)}$(location)</span>`
              : ''
          }${nSpaces(2)}</td>
      </tr>
    `.trim()
}

function renderDivider() {
  return `
    <tr>
      <td colspan="${TOTAL_COLS}"><hr></td>
    </tr>
  `.trim()
}

function renderDynamicOverflowFooter(remainingCount: number) {
  return `
    <tr>
      <td colspan="${TOTAL_COLS}"><span style="color:${TEXT_SECONDARY_COLOR};">and ${remainingCount} more...</span></td>
    </tr>
  `.trim()
}

function renderEmptyLine() {
  return `
    <tr>
      <td colspan="${TOTAL_COLS}"></td>
    </tr>
  `.trim()
}

function nonBreakingHyphen() {
  return '&#8209;'
}

function escapeHtml(maybeHtml: string) {
  return maybeHtml.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function editTranslationIconAction(args: CmdEditTranslationArgs) {
  return `<a href="${renderCmdHref('editTranslation', args)}" title="Edit translation"><span>$(pencil)</span></a>`
}

function moreActionsIconAction(args: CmdActionsWithTranslationsArgs) {
  return `<a href="${renderCmdHref('actionsWithTranslations', args)}" title="More actions">${nSpaces(3)}$(more)</a>`
}

function nSpaces(n: number) {
  return Array.from({ length: n })
    .map(() => '&nbsp;')
    .join('')
}

function truncateFilename(filename: string) {
  const onlyName = extractFileName(filename, true)
  if (onlyName.length > 51) {
    return onlyName.slice(0, 24) + '...' + onlyName.slice(-24)
  }
  return onlyName
}

function renderCmdHref(command: string, args: any) {
  return vscode.Uri.parse(`command:loccy.${command}?${encodeURIComponent(JSON.stringify(args))}`).toString()
}

export function renderTranslationPreviewForKeypath(keypathInfo: KeypathInfo, moduleName?: string) {
  const view = viewFor(moduleName)
  if (!view) {
    return ''
  }
  const primaryKeypath = keypathInfo.keypaths[0] ?? keypathInfo.content
  const translationsPerKeypath = view.getFlatTranslationsPerKeypath(keypathInfo.ns) ?? {}
  const translationsForKey = translationsPerKeypath[primaryKeypath] ?? {}

  let translationForDisplayLocale =
    translationsForKey[view.displayLocale] ??
    Object.values(sortLocalizedText(view.existingTranslationsLocalizedText(primaryKeypath, keypathInfo.ns)))[0] ??
    ''

  if (translationForDisplayLocale) {
    translationForDisplayLocale = resolveMessageReferences(
      translationForDisplayLocale,
      view.displayLocale,
      keypathInfo.ns,
      view.name,
    )
  }

  // Exclude partial overrides (partial-by-design — their empty keys are intentional, inherited
  // from their base at runtime).
  const excludeLocales = partialOverridesOf(cfg.resolvedConfig?.styleguide?.localeRules).map((o) => o.locale)

  // Gate on the rule; for plurals, only check missing for locales that need this suffix.
  const emptyLocales =
    view.module.translations.noUntranslatedKeys === false
      ? []
      : getEmptyLocalesForKeypath(primaryKeypath, translationsForKey, keypathInfo, moduleName).filter(
          (locale) => !excludeLocales.includes(locale),
        )

  const warningText = renderMissingWarning(emptyLocales)
  const separator = warningText && translationForDisplayLocale ? ' • ' : ''
  return `${warningText}${separator}${translationForDisplayLocale}`.trim()
}

function getEmptyLocalesForKeypath(
  keypath: string,
  translationsForKey: Record<string, string>,
  keypathInfo: KeypathInfo,
  moduleName?: string,
): string[] {
  const view = viewFor(moduleName)
  if (!view) {
    return []
  }
  if (keypathInfo.type === 'plurals') {
    const numberType: PluralNumberType = keypathInfo.ordinal ? 'ordinal' : 'cardinal'

    // Value-locus (icu/vue): incomplete if value missing or plural lacks a required branch.
    if (view.messageFormat.valueCodec) {
      return view.allLocales.filter(
        (locale) =>
          !translationsForKey[locale] ||
          missingValuePluralCategories(translationsForKey[locale]!, locale, view.messageFormat, numberType).length > 0,
      )
    }

    // Key-locus (suffix-cldr): only locales that need this suffix key must define it.
    const suffix = extractPluralSuffix(keypath)
    const relevantLocales = suffix
      ? view.allLocales.filter((locale) => getPluralCategories([locale], numberType).includes(suffix))
      : view.allLocales
    return relevantLocales.filter((locale) => !translationsForKey[locale])
  }

  const allLocalesLocalizedText = view.allLocalesLocalizedText(keypath, keypathInfo.ns)
  return Object.entries(allLocalesLocalizedText)
    .filter(([, v]) => !v)
    .map(([k]) => k)
}

function renderMissingWarning(emptyLocales: string[]) {
  const renderWithWarning = emptyLocales.length > 0 && cfg.settings.annotations.showMissingTranslationsWarning
  if (!renderWithWarning) {
    return ''
  }

  let missingTranslationsLabel = ''
  const minMissingLocalesToDisplay = cfg.settings.annotations.minMissingLocalesToDisplay
  if (minMissingLocalesToDisplay > 0) {
    const alwaysInclude = emptyLocales.slice(0, minMissingLocalesToDisplay)
    const rest = emptyLocales.slice(minMissingLocalesToDisplay)
    if (rest.length <= 2) {
      missingTranslationsLabel = [...alwaysInclude, ...rest].join(', ')
    } else {
      missingTranslationsLabel = alwaysInclude.join(', ') + `, +${rest.length} more`
    }
    missingTranslationsLabel = ` (${missingTranslationsLabel})`
  }

  return `⚠️ ${emptyLocales.length} missing${missingTranslationsLabel}`
}
