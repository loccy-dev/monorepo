import type { LocalizedText } from '@repo/types/primitives.types'
import { loccyConfigFilename } from '@repo/types/config.types'
import { findRedundantOverrides, primaryLocales } from '@repo/shared/core/loccy-config/regional-override-guards'
import {
  checkDoNotTranslate,
  checkGlossary,
  type ComplianceIssue,
} from '@repo/shared/utils/styleguide/check-compliance'
import { s } from '@repo/shared/core/helpers/helpers'
import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import {
  fail,
  loadModuleContext,
  requireKeypath,
  resolveNamespace,
  type KeyOptions,
  type ModuleContext,
} from '../context'
import { collapsePaths } from '../file-list'
import { failOnStructuralCollision } from '../keypath-guards'
import { hasStyleguideRules, styleguideToken } from '../styleguide-output'
import { readStdin } from '../stdin'
import { writeAllOrNothing } from '../write'

/** One key's write: where it lands and what every locale is to say. */
interface Entry {
  ns: string
  keypath: string
  values: LocalizedText
}

/**
 * The `{ locale: value }` payload, checked against the locales the project actually has. An unknown
 * code would otherwise be taken at face value and scaffold a whole locale file nobody asked for,
 * forking the corpus on a typo.
 */
function parseValues(ctx: ModuleContext, key: string, raw: unknown): LocalizedText {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    fail(`error: ${key} must map to a JSON object of { locale: value }`)
  }

  const values: LocalizedText = {}
  for (const [locale, value] of Object.entries(raw)) {
    if (typeof value !== 'string') fail(`error: ${key}: value for locale "${locale}" must be a string`)
    if (!ctx.rm.allLocales.includes(locale)) {
      fail(
        `error: ${key}: locale "${locale}" is not one of this project's: ${ctx.rm.allLocales.join(', ')}`,
        `  adding a locale means adding its translation files and declaring it in ${loccyConfigFilename}, not writing one message at it`,
      )
    }
    values[locale] = value
  }
  return values
}

function parseJson(raw: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail(`error: invalid JSON on stdin:`, raw)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return fail('error: expected a JSON object on stdin')
  }
  return parsed as Record<string, unknown>
}

/** What stdin describes: `{ key: { locale: value } }`, one key in it or many. */
function parseEntries(ctx: ModuleContext, raw: string, options: KeyOptions): { ns: string; entries: Entry[] } {
  const parsed = parseJson(raw)
  if (!Object.keys(parsed).length) fail('error: the batch on stdin is empty')

  const ns = resolveNamespace(ctx, options)
  const entries = Object.entries(parsed).map(([entryKey, values]) => ({
    ns,
    keypath: requireKeypath(entryKey),
    values: parseValues(ctx, entryKey, values),
  }))
  return { ns, entries }
}

/** Locales whose value is an empty string, meaning delete the key from their file. */
function deletedLocales(values: LocalizedText): string[] {
  return Object.entries(values)
    .filter(([, value]) => !value.trim())
    .map(([locale]) => locale)
}

/** Hard guards. Anything reported here is mechanically wrong, so the whole batch is refused. */
function enforceGuards(ctx: ModuleContext, entries: Entry[]): void {
  const styleguide = ctx.config.styleguide
  const problems: string[] = []

  for (const { ns, keypath, values } of entries) {
    const key = qualifyKey(ns, keypath)
    const stored = (locale: string): string | undefined => ctx.rm.getFlatTranslationsPerLocale(ns)[locale]?.[keypath]

    for (const { locale, extends: parent, value } of findRedundantOverrides(values, styleguide, stored)) {
      problems.push(
        `error: ${key}: ${locale} is a partial override of ${parent} and repeats it: "${value}"`,
        `  a partial-override locale carries its own value only where the text deviates; everywhere else it inherits at` +
          ' runtime, so a copy here is dead weight that goes stale the day the parent changes',
        `  drop ${locale} from the JSON`,
      )
    }
  }

  if (problems.length) fail(...problems)
}

/**
 * Advice worth printing but never worth blocking on: both checks read a term as a plain substring,
 * which an ordinary word of another language can match by coincidence.
 */
function printAdvisories(ctx: ModuleContext, entries: Entry[]): void {
  const styleguide = ctx.config.styleguide

  for (const { ns, keypath, values } of entries) {
    const key = qualifyKey(ns, keypath)

    printIssues(key, 'do-not-translate', checkDoNotTranslate(values, styleguide))
    printIssues(key, 'glossary', checkGlossary(values, styleguide))
  }
}

function printIssues(key: string, check: string, issues: ComplianceIssue[]): void {
  if (!issues.length) return

  console.log(`warning: ${key}: automated ${check} check triggered. Fix unless it is a false positive.`)
  for (const issue of issues) console.log(`  ${issue.message}`)
}

/** Points at the rules rather than reprinting them: that command is what hands out the token. */
function printStyleguideReview(ctx: ModuleContext, entries: Entry[]): void {
  for (const entry of entries) {
    const deleted = deletedLocales(entry.values)
    if (deleted.length) {
      console.log(
        `Note: "" for ${deleted.join(', ')} deletes ${qualifyKey(entry.ns, entry.keypath)} from those locale files.`,
      )
    }
  }

  console.log('\n  loccy-tool styleguide')
  console.log('\nThat prints the rules this project writes by, and the token. Check the values against them,')
  console.log('then rerun with --styleguided <token>.')
}

/** Every line of a rule sits under its locale, so a rule of any length stays one visual block. */
function indented(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}

function printSection(title: string, blocks: string[]): void {
  if (!blocks.length) return

  console.log(`\n${title}\n`)
  console.log(blocks.join('\n\n'))
}

/** Every locale that has a rule. Overrides stand apart: what they say is a deviation, not a style. */
function printLocaleRules(ctx: ModuleContext): void {
  const rules = ctx.config.styleguide?.localeRules ?? {}
  const prose: string[] = []
  const overrides: string[] = []

  for (const locale of ctx.rm.allLocales) {
    const rule = rules[locale]
    if (rule === undefined) continue

    if (typeof rule === 'string') {
      if (rule.trim()) prose.push(`  ${locale}\n${indented(rule)}`)
      continue
    }
    overrides.push(`  ${locale} extends ${rule.extends}\n${indented(rule.style || 'no deviation documented')}`)
  }

  printSection('Locale rules:', prose)
  printSection('Partial overrides, each inheriting unless its text deviates:', overrides)
}

/**
 * The locale set, which a directory listing does not give away, in the three shapes a write takes:
 * one locale, the ones that each carry their own value, and every locale there is.
 */
function printTemplate(ctx: ModuleContext): void {
  const primary = primaryLocales(ctx.rm.allLocales, ctx.config.styleguide)
  const skeleton = (locales: string[]): string =>
    JSON.stringify({ 'login.title': Object.fromEntries(locales.map((locale) => [locale, ''])) })

  console.log(`Values for "${ctx.module.name}" go in as JSON on stdin, every key you are changing in one call:\n`)
  console.log(`  one locale:      ${skeleton([primary.at(-1) ?? ctx.rm.allLocales[0]!])}`)
  console.log(`  primary locales: ${skeleton(primary)}`)
  if (primary.length < ctx.rm.allLocales.length) console.log(`  all locales:     ${skeleton(ctx.rm.allLocales)}`)

  printLocaleRules(ctx)
}

/** Add or update keys across locale files. Points at the styleguide and writes nothing until confirmed. */
export async function upsertMessageCommand(options: KeyOptions & { styleguided?: string }): Promise<void> {
  const raw = await readStdin()
  const ctx = await loadModuleContext(options)

  // No values yet: answer "what do you need from me" instead of erroring on it.
  if (!raw.trim()) {
    printTemplate(ctx)
    return
  }

  const { ns, entries } = parseEntries(ctx, raw, options)
  failOnStructuralCollision(
    ctx,
    ns,
    entries.map((entry) => entry.keypath),
  )
  enforceGuards(ctx, entries)

  printAdvisories(ctx, entries)

  // A styleguide with no rules has nothing to check against, so demanding the handshake would only
  // cost a round trip.
  if (hasStyleguideRules(ctx.config) && !confirmed(ctx, entries, options.styleguided)) return

  await applyEntries(ctx, entries)
}

/**
 * Whether the caller has been shown the rules this write is checked against. A stale token means the
 * styleguide moved since it was issued, which is the one case worth distinguishing: the caller did
 * read rules, just not the ones in force now.
 */
function confirmed(ctx: ModuleContext, entries: Entry[], token: string | undefined): boolean {
  const expected = styleguideToken(ctx.config)
  if (token === expected) return true

  // Nothing records which tokens were ever handed out, so this cannot claim the rules changed:
  // a token from another project has never been issued here at all.
  if (token) {
    console.log(`\n[nothing written yet] token ${token} does not match this project's styleguide as it stands.`)
    console.log('Either the rules changed since it was issued, or it came from somewhere else.')
  } else {
    console.log('\n[nothing written yet] this call carries no --styleguided token.')
  }
  printStyleguideReview(ctx, entries)
  return false
}

async function applyEntries(ctx: ModuleContext, entries: Entry[]): Promise<void> {
  const before = new Map(
    entries.map((entry) => [
      qualifyKey(entry.ns, entry.keypath),
      ctx.rm.existingTranslationsLocalizedText(entry.keypath, entry.ns),
    ]),
  )

  const changed = new Map<string, string>()
  for (const ns of new Set(entries.map((entry) => entry.ns))) {
    const perKeypath = Object.fromEntries(
      entries.filter((entry) => entry.ns === ns).map((entry) => [entry.keypath, entry.values]),
    )
    for (const [filePath, content] of ctx.rm.updateKeypaths(perKeypath, ns)) changed.set(filePath, content)
  }

  if (!changed.size) {
    console.log(`no change: the files already say exactly this for ${entries.length} key${s(entries.length)}`)
    return
  }

  await writeAllOrNothing(ctx.platform, changed)

  // The caller sent these values and named these keys, so neither is worth printing back.
  console.log(`wrote ${entries.length} key${s(entries.length)} to ${collapsePaths([...changed.keys()])}`)
  printStaleNameReminder(entries, before)
}

/**
 * Reworded copy is where a keypath quietly stops describing its message. Raised only where copy a
 * key already carried actually changed, never for one this call adds.
 */
function printStaleNameReminder(entries: Entry[], before: Map<string, LocalizedText>): void {
  const reworded = entries.some((entry) =>
    Object.entries(entry.values).some(([locale, value]) => {
      const previous = before.get(qualifyKey(entry.ns, entry.keypath))?.[locale]?.trim()
      return previous && value.trim() && previous !== value.trim()
    }),
  )
  if (!reworded) return

  console.log('  hint: copy changed, so a keypath may no longer describe its message. rename-key the ones that drifted')
}
