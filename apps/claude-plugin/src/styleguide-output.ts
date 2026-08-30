import { createHash } from 'node:crypto'
import {
  loccyConfigFilename,
  preferredForm,
  type DoNotTranslateEntry,
  type GlossaryEntry,
  type LoccyConfig,
} from '@repo/types/config.types'
import { allSupportedLanguages } from '@repo/shared/core/config'
import { getLocaleRank } from '@repo/shared/core/helpers/locale.helpers'
import { renderStyleguideYaml } from '@repo/shared/core/loccy-config/config-templates'
import { localeTerm } from '@repo/shared/utils/styleguide/check-compliance'
import { primaryLocales } from '@repo/shared/core/loccy-config/regional-override-guards'

/** Whether the styleguide says anything at all, which decides between printing it and offering to author it. */
export function hasStyleguideRules(config: LoccyConfig): boolean {
  const styleguide = config.styleguide
  return Boolean(
    styleguide?.keys?.trim() ||
    styleguide?.product?.trim() ||
    styleguide?.voice?.trim() ||
    styleguide?.mechanics?.trim() ||
    Object.keys(styleguide?.localeRules ?? {}).length ||
    styleguide?.doNotTranslate?.length ||
    styleguide?.glossary?.length,
  )
}

/** Rules the config could not load. Nothing else reports them, so the styleguide reads as complete. */
export function droppedStyleguideNote(config: LoccyConfig): string | null {
  const dropped = config.droppedStyleguideFields
  if (!dropped?.length) return null

  return [
    '## Styleguide fields ignored',
    '',
    `${loccyConfigFilename} spells these in a shape the schema cannot take, so they were dropped and`,
    'nothing is checked against them. Tell the user, and offer to fix them:',
    '',
    ...dropped.map(({ field, reason }) => `  ${field}: ${reason}`),
  ].join('\n')
}

/** Key order in the file is not a rule change, so the digest is taken from the shape, not the text. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * The confirmation a write carries, hashed from the whole styleguide: unguessable, handed out only
 * where the rules are printed in full, and dead the moment they change.
 */
export function styleguideToken(config: LoccyConfig): string {
  return createHash('sha256')
    .update(stableStringify(config.styleguide ?? {}))
    .digest('hex')
    .slice(0, 8)
}

/** A locale's place in the popularity order, by its language where the region has no place of its own. */
function localeRank(locale: string): number {
  const exact = getLocaleRank(locale)
  return exact < allSupportedLanguages.length ? exact : getLocaleRank(locale.split('-')[0]!)
}

/**
 * The one form a glossary entry is named by here. No locale is the project's source, so the most
 * widely spoken one it has a form for stands in; the rest are a lookup away.
 */
function briefTerm(entry: GlossaryEntry, locales: string[]): string | null {
  for (const locale of [...locales].sort((a, b) => localeRank(a) - localeRank(b))) {
    const form = preferredForm(localeTerm(entry.terms, locale) ?? '')
    if (form) return form
  }
  return null
}

function glossaryLine(entry: GlossaryEntry, locales: string[]): string | null {
  const term = briefTerm(entry, locales)
  return term && `  ${term}: ${entry.definition}`
}

function doNotTranslateLine(entry: DoNotTranslateEntry): string {
  const head = `  ${entry.term} (never translated)`
  return entry.definition ? `${head}: ${entry.definition}` : head
}

/**
 * Every governed term in one list, a line each. Only the term and what it means: the per-locale forms
 * are what scales with the corpus, and a write breaking one is refused with the rule that fired.
 */
function terminologySection(config: LoccyConfig, allLocales: string[], configPath: string): string | null {
  const styleguide = config.styleguide
  const locales = primaryLocales(allLocales, styleguide)

  const lines = [
    ...(styleguide?.glossary ?? []).map((entry) => glossaryLine(entry, locales)).filter((line) => line !== null),
    ...(styleguide?.doNotTranslate ?? []).map(doNotTranslateLine),
  ]
  if (!lines.length) return null

  return ['## Terminology', '', ...lines, '', `Full entries: ${configPath}`].join('\n')
}

/** The styleguide without the terminology lists, which are rendered a line each instead. */
function ruleFields(styleguide: LoccyConfig['styleguide']): LoccyConfig['styleguide'] {
  const kept = Object.entries(styleguide ?? {}).filter(([field]) => field !== 'glossary' && field !== 'doNotTranslate')
  return kept.length ? Object.fromEntries(kept) : undefined
}

/**
 * The rules a write is checked against, whole, and the token that stands for them. Printed by the
 * write that arrived without it, so what reaches the caller is the tool's own answer to a call it
 * made: nothing to pipe through, and nothing to read a slice of. The token is issued nowhere else,
 * so carrying one means these rules were read.
 *
 * The config is named by path: it is the one file a caller is sent to, and the tool runs from
 * outside the project it is pointing into.
 */
export function styleguideBriefing(
  config: LoccyConfig,
  allLocales: string[],
  configPath: string,
  headline: string,
): string {
  const rules = ruleFields(config.styleguide)

  return [
    headline,
    // Before the rules: it says which of them are missing.
    droppedStyleguideNote(config),
    rules && renderStyleguideYaml(rules).trimEnd(),
    terminologySection(config, allLocales, configPath),
    `Check the values against these rules, then repeat the call with --styleguided ${styleguideToken(config)}` +
      ' (same token on every write until the rules change).',
  ]
    .filter(Boolean)
    .join('\n\n')
}
