import type { LocalizedText } from '@repo/types/primitives.types'
import { loccyConfigFilename } from '@repo/types/config.types'
import {
  findMissingPrimaryLocales,
  findRedundantOverrides,
  primaryLocales,
} from '@repo/shared/core/loccy-config/regional-override-guards'
import {
  checkDoNotTranslate,
  checkGlossary,
  type ComplianceIssue,
} from '@repo/shared/utils/styleguide/check-compliance'
import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import {
  fail,
  loadModuleContext,
  requireKeypath,
  resolveNamespace,
  type KeyOptions,
  type ModuleContext,
} from '../context'
import { failOnStructuralCollision } from '../keypath-guards'
import {
  hasStyleguideRules,
  printHandshake,
  printInheritedOverrides,
  printStyleguide,
  styleguidedFlag,
  styleguideToken,
} from '../styleguide-output'
import { readStdin } from '../stdin'
import { blockIfStillUsed, scanUsages } from '../usages'
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

/** Locales that would still hold the key after the write, counting what the files already say. */
function remainingLocales(ctx: ModuleContext, entry: Entry): string[] {
  return ctx.rm.allLocales.filter((locale) =>
    locale in entry.values
      ? entry.values[locale]!.trim()
      : ctx.rm.getFlatTranslationsPerLocale(entry.ns)[locale]?.[entry.keypath]?.trim(),
  )
}

/** Hard guards. Anything reported here is mechanically wrong, so the whole batch is refused. */
function enforceGuards(ctx: ModuleContext, entries: Entry[]): void {
  const styleguide = ctx.config.styleguide
  const problems: string[] = []

  for (const { ns, keypath, values } of entries) {
    const key = qualifyKey(ns, keypath)
    const stored = (locale: string): string | undefined => ctx.rm.getFlatTranslationsPerLocale(ns)[locale]?.[keypath]

    const missing = findMissingPrimaryLocales(values, ctx.rm.allLocales, styleguide)
    if (missing.length) {
      problems.push(
        `error: ${key} says nothing about primary locale(s): ${missing.join(', ')}`,
        `  this key needs all of: ${primaryLocales(ctx.rm.allLocales, styleguide).join(', ')}, and upsert-message writes exactly the locales you pass`,
        '  give each one text, or "" to delete the key from that locale',
      )
    }

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
    printTwins(key, values)
  }
}

function printIssues(key: string, check: string, issues: ComplianceIssue[]): void {
  if (!issues.length) return

  console.log(`warning: ${key}: automated ${check} check triggered. Fix unless it is a false positive.`)
  for (const issue of issues) console.log(`  ${issue.message}`)
}

/** Locales saying exactly the same thing, which usually means one of them should inherit instead. */
function printTwins(key: string, values: LocalizedText): void {
  const byText = new Map<string, string[]>()
  for (const [locale, value] of Object.entries(values)) {
    const text = value.trim()
    if (!text) continue
    byText.set(text, [...(byText.get(text) ?? []), locale])
  }

  for (const [text, locales] of byText) {
    if (locales.length < 2) continue
    console.log(`warning: ${key}: ${locales.join(', ')} all say "${text}"`)
    console.log(
      '  where one of these only ever deviates from another in small ways, configure it as' +
        ' { extends: <locale> } under styleguide.localeRules and omit it here',
    )
  }
}

/** Every locale any entry writes, in project order. */
function touchedLocales(ctx: ModuleContext, entries: Entry[]): string[] {
  const touched = new Set(entries.flatMap((entry) => Object.keys(entry.values)))
  return ctx.rm.allLocales.filter((locale) => touched.has(locale))
}

/** The styleguide review this command demands before it writes anything. */
function printStyleguideReview(ctx: ModuleContext, entries: Entry[]): void {
  console.log('\n[nothing written yet]')

  for (const entry of entries) {
    const deleted = deletedLocales(entry.values)
    if (deleted.length) {
      console.log(
        `Note: "" for ${deleted.join(', ')} deletes ${qualifyKey(entry.ns, entry.keypath)} from those locale files.`,
      )
    }
  }

  console.log('Check the values you passed against the styleguide below, and fix them where they drift.\n')

  printStyleguide(ctx.config, ctx.rm.allLocales, touchedLocales(ctx, entries))
  printHandshake(`  rerun the same command, with ${styleguidedFlag(ctx.config)} added`)
}

/**
 * What to send, for a caller that has none of it yet: the exact locale set a key needs, as a
 * skeleton to fill, plus the styleguide those values have to satisfy. The locale set is never
 * guessable from a directory listing, so asking for it beats failing on it.
 */
function printTemplate(ctx: ModuleContext): void {
  const required = primaryLocales(ctx.rm.allLocales, ctx.config.styleguide)
  const skeleton = Object.fromEntries(required.map((locale) => [locale, '']))

  console.log(`upsert-message needs every primary locale of "${ctx.module.name}" in one call, as JSON on stdin:\n`)
  console.log(`  ${JSON.stringify({ 'login.title': skeleton })}\n`)
  console.log('Text writes the value. "" deletes the key from that locale file, which is how one locale')
  console.log('drops back to its fallback while the others keep the key.\n')

  printStyleguide(ctx.config, ctx.rm.allLocales, required)

  const batch = JSON.stringify({ 'login.title': skeleton, 'login.subtitle': skeleton })
  printHandshake(`  loccy-tool upsert-message ${styleguidedFlag(ctx.config)} <<'EOF'\n  ${batch}\n  EOF`)
}

/** Add or update keys across locale files. Prints the styleguide and writes nothing until confirmed. */
export async function upsertMessageCommand(
  options: KeyOptions & { styleguided?: string; force?: boolean },
): Promise<void> {
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

  // Emptying every locale is a delete by another name, so it answers to the same guard.
  const emptied = entries.filter((entry) => !remainingLocales(ctx, entry).length)
  if (emptied.length) {
    blockIfStillUsed(ctx, await scanUsages(ctx, emptied), emptied, options.force ?? false)
  }

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
    console.log('Here are the rules as they are now. Check the values against them again.\n')
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

  await writeAllOrNothing(ctx.platform, changed)

  for (const entry of entries) {
    const key = qualifyKey(entry.ns, entry.keypath)
    console.log(`wrote: ${key}`)
    for (const [locale, value] of Object.entries(entry.values)) {
      console.log(`  ${locale}: ${value.trim() ? value : '(deleted from this locale)'}`)
    }
    printStaleNameReminder(entry, before.get(key) ?? {})
  }
  console.log(`files: ${[...changed.keys()].join(', ')}`)

  printInheritedOverrides(ctx.config, ctx.rm.allLocales, touchedLocales(ctx, entries))
}

/**
 * Reworded copy is where a keypath quietly stops describing its message. Raised only where copy
 * this key already carried actually changed, so it stays a prompt to look rather than a footer.
 */
function printStaleNameReminder(entry: Entry, before: LocalizedText): void {
  const reworded = Object.entries(entry.values).find(
    ([locale, value]) => before[locale]?.trim() && value.trim() && before[locale]!.trim() !== value.trim(),
  )
  if (!reworded) return

  const [locale, value] = reworded
  const segment = entry.keypath.split('.').pop()
  console.log(
    `  reminder: this key is named "${segment}" and its ${locale} value now reads "${value.trim()}" (was "${before[locale]!.trim()}")`,
  )
  console.log(
    '    keep the name if it still describes the message: it is referenced from source, so renaming is not free',
  )
  console.log('    if the name has become misleading: loccy-tool rename-key <old> <new>')
}
