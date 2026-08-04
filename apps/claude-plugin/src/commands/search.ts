import { partialOverridesOf } from '@repo/types/config.types'
import { s } from '@repo/shared/core/helpers/helpers'
import { NS_WITHOUT_NS, qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import type { QualifiedKeypath } from '@repo/shared/core/usages/find-usages'
import {
  fail,
  failOnNamespacedKey,
  loadModuleContext,
  requireCount,
  requireLocale,
  truncationLine,
  type ModuleContext,
  type ModuleOptions,
} from '../context'
import { readStdin } from '../stdin'

/** One filter over one string: the query as a case-insensitive pattern. */
type Matcher = (haystack: string) => boolean

function compile(query: string, what: string): RegExp {
  try {
    return new RegExp(query, 'i')
  } catch (err) {
    return fail(`error: ${what} is not a valid regular expression: ${err instanceof Error ? err.message : err}`)
  }
}

function matcherFor(query: string, what: string): Matcher {
  const pattern = compile(query, what)
  return (haystack) => pattern.test(haystack)
}

/** Everything every query in one call is run against, resolved once. */
interface Search {
  ctx: ModuleContext
  namespaces: string[]
  locales: string[]
  /** Whether `locales` is the caller's pick or simply all of them, which the header calls out. */
  narrowed: boolean
  /** Locales the styleguide declares as partial overrides, where no text of their own is the norm. */
  inheriting: Set<string>
  /** The keypath filter, which every query in the call is narrowed by. */
  key: Matcher | null
  /** Uncapped by default: an audit that silently stops at ten reads as a corpus that holds ten. */
  limit: number | null
}

/** Messages the keypath filter and the text query both accept, each listed once. */
function matchesFor({ ctx, namespaces, locales, key }: Search, text: Matcher | null): QualifiedKeypath[] {
  const matched: QualifiedKeypath[] = []

  for (const ns of namespaces) {
    const flatPerLocale = ctx.rm.getFlatTranslationsPerLocale(ns)
    const seen = new Set<string>()
    // Every locale, since a key can be translated in one and missing in another, and the text a
    // query looks for can sit in any of them.
    for (const locale of locales) {
      for (const [keypath, value] of Object.entries(flatPerLocale[locale] ?? {})) {
        if (seen.has(keypath)) continue
        if (key && !key(keypath)) continue
        if (text && !text(value)) continue
        seen.add(keypath)
        matched.push({ ns, keypath })
      }
    }
  }

  return matched.sort((a, b) => qualifyKey(a.ns, a.keypath).localeCompare(qualifyKey(b.ns, b.keypath)))
}

/** What each locale says, with the ones inheriting from a parent left out rather than called gaps. */
function valuesOf({ ctx, locales, inheriting }: Search, { ns, keypath }: QualifiedKeypath): Record<string, string> {
  const flatPerLocale = ctx.rm.getFlatTranslationsPerLocale(ns)
  const values: Record<string, string> = {}

  for (const locale of locales) {
    const value = flatPerLocale[locale]?.[keypath]
    if (value !== undefined) values[locale] = value
    else if (!inheriting.has(locale)) values[locale] = ''
  }
  return values
}

function printMatches(search: Search, label: string, matched: QualifiedKeypath[]): void {
  const { locales, narrowed, limit } = search
  if (!matched.length) return void console.log(`No matches for ${label}`)

  const where = narrowed ? ` in ${locales.join(', ')}` : ''
  console.log(`${matched.length} match${s(matched.length, 'es')} for ${label}${where}\n`)

  for (const match of matched.slice(0, limit ?? matched.length)) {
    console.log(`keypath: ${qualifyKey(match.ns, match.keypath)}`)
    console.log('locales:')
    for (const [locale, value] of Object.entries(valuesOf(search, match))) {
      console.log(`  ${locale}: ${value || '(missing)'}`)
    }
    console.log('')
  }

  const truncated = limit === null ? null : truncationLine(matched.length, limit, '--limit')
  if (truncated) console.log(truncated)
}

/** What a block of results says it was searched for, since a call can narrow by key, by text, or both. */
function labelFor(keyQuery: string | undefined, text: string | undefined): string {
  return [text && `"${text}"`, keyQuery && `keys matching "${keyQuery}"`].filter(Boolean).join(' and ')
}

/**
 * The whole call as one document, for a caller joining these matches against something else. Every
 * block the text form prints is here, so the two never answer differently.
 */
function printJson(search: Search, blocks: { text?: string; key?: string; matched: QualifiedKeypath[] }[]): void {
  console.log(
    JSON.stringify(
      {
        locales: search.locales,
        results: blocks.map(({ text, key, matched }) => ({
          text: text ?? null,
          key: key ?? null,
          total: matched.length,
          matches: matched.slice(0, search.limit ?? matched.length).map((match) => ({
            ns: match.ns === NS_WITHOUT_NS ? null : match.ns,
            keypath: match.keypath,
            values: valuesOf(search, match),
          })),
        })),
      },
      null,
      2,
    ),
  )
}

/** `--key -`: exact keypaths piped in, for a caller holding a key list rather than a pattern. */
async function keySetMatcher(): Promise<Matcher> {
  const keys = new Set(
    (await readStdin())
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  )
  if (!keys.size) fail('error: --key - got nothing on stdin', '  pipe the keypaths in, one per line')
  keys.forEach(failOnNamespacedKey)
  return (keypath) => keys.has(keypath)
}

/**
 * Search the corpus by text, by keypath, or by both at once. Every query is a regular expression,
 * so a malformed one is an error rather than a silent empty result, and a phrase to match literally
 * is the same query with its pattern characters escaped.
 */
export async function searchCommand(
  queries: string[],
  options: ModuleOptions & {
    locale?: string
    limit?: string
    ns?: string
    key?: string
    json?: boolean
  },
): Promise<void> {
  const ctx = await loadModuleContext(options)

  const namespaces = ctx.rm.namespaces.filter((ns) => ns !== NS_WITHOUT_NS)
  if (options.ns && !namespaces.includes(options.ns)) {
    fail(`Namespace "${options.ns}" not found. Available: ${namespaces.join(', ') || 'none'}`)
  }

  if (!queries.length && !options.key) {
    fail('error: nothing to search for', '  pass text to match, or --key <pattern> to match the keypath, or both')
  }
  const fromStdin = options.key === '-'
  if (options.key && !fromStdin) failOnNamespacedKey(options.key)

  const search: Search = {
    ctx,
    // Every namespace by default: a match hiding in a namespace nobody named is the whole problem.
    namespaces: options.ns ? [options.ns] : ctx.rm.namespaces,
    locales: options.locale ? [requireLocale(ctx, options.locale)] : ctx.rm.allLocales,
    narrowed: Boolean(options.locale),
    inheriting: new Set(partialOverridesOf(ctx.config.styleguide?.localeRules).map((override) => override.locale)),
    key: fromStdin ? await keySetMatcher() : options.key ? matcherFor(options.key, `--key "${options.key}"`) : null,
    limit: options.limit === undefined ? null : requireCount(options.limit, '--limit', 0),
  }

  // A call with no text is the keypath filter on its own, which is one block rather than none.
  const texts: (string | undefined)[] = queries.length ? queries : [undefined]
  const blocks = texts.map((text) => ({
    text,
    key: fromStdin ? 'the keys on stdin' : options.key,
    matched: matchesFor(search, text === undefined ? null : matcherFor(text, `"${text}"`)),
  }))

  if (options.json) return printJson(search, blocks)

  blocks.forEach(({ text, key, matched }, index) => {
    if (index) console.log('')
    printMatches(search, labelFor(key, text), matched)
  })
}
