import { partialOverridesOf } from '@repo/types/config.types'
import { s } from '@repo/shared/core/helpers/helpers'
import { NS_WITHOUT_NS, qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import type { QualifiedKeypath } from '@repo/shared/core/usages/find-usages'
import {
  fail,
  loadModuleContext,
  requireCount,
  requireLocale,
  truncationLine,
  type ModuleContext,
  type ModuleOptions,
} from '../context'
import { printUsages, scanUsages, type UsageScan } from '../usages'

const DEFAULT_LIMIT = 10

/** Everything the queries in one call are run against, resolved once. */
interface Search {
  ctx: ModuleContext
  namespaces: string[]
  locales: string[]
  /** Whether `locales` is the caller's pick or simply all of them, which the header calls out. */
  narrowed: boolean
  /** Locales the styleguide declares as partial overrides, where no text of their own is the norm. */
  inheriting: Set<string>
  limit: number
}

/** Messages whose text holds `query` in any of the searched locales, each listed once. */
function matchesFor({ ctx, namespaces, locales }: Search, query: string): QualifiedKeypath[] {
  const needle = query.toLowerCase()
  const matched: QualifiedKeypath[] = []

  for (const ns of namespaces) {
    const flatPerLocale = ctx.rm.getFlatTranslationsPerLocale(ns)
    const seen = new Set<string>()
    for (const locale of locales) {
      for (const [keypath, value] of Object.entries(flatPerLocale[locale] ?? {})) {
        if (seen.has(keypath) || !value.toLowerCase().includes(needle)) continue
        seen.add(keypath)
        matched.push({ ns, keypath })
      }
    }
  }

  return matched.sort((a, b) => qualifyKey(a.ns, a.keypath).localeCompare(qualifyKey(b.ns, b.keypath)))
}

function printMatches(search: Search, scan: UsageScan, query: string, matched: QualifiedKeypath[]): void {
  const { ctx, locales, narrowed, inheriting, limit } = search
  if (!matched.length) return void console.log(`No matches for "${query}"`)

  const where = narrowed ? ` in ${locales.join(', ')}` : ''
  console.log(`${matched.length} match${s(matched.length, 'es')} for "${query}"${where}\n`)

  for (const { ns, keypath } of matched.slice(0, limit)) {
    const flatPerLocale = ctx.rm.getFlatTranslationsPerLocale(ns)
    console.log(`keypath: ${qualifyKey(ns, keypath)}`)
    console.log('locales:')
    for (const locale of locales) {
      const value = flatPerLocale[locale]?.[keypath]
      // A partial override falling back to what it extends is the design, not a gap to report.
      if (value === undefined && inheriting.has(locale)) continue
      console.log(`  ${locale}: ${value ?? '(missing)'}`)
    }
    printUsages(scan, ns, keypath)
    console.log('')
  }

  const truncated = truncationLine(matched.length, limit, '--limit')
  if (truncated) console.log(truncated)
}

/**
 * Substring search over translated text, one block per query. Keypaths are never matched: a key is
 * how a message is addressed, not how it is found, and its spelling standing in for the text was
 * only ever noise between a word and the messages that use it.
 */
export async function searchCommand(
  queries: string[],
  options: ModuleOptions & { locale?: string; limit?: string; ns?: string },
): Promise<void> {
  const ctx = await loadModuleContext(options)

  const namespaces = ctx.rm.namespaces.filter((ns) => ns !== NS_WITHOUT_NS)
  if (options.ns && !namespaces.includes(options.ns)) {
    fail(`Namespace "${options.ns}" not found. Available: ${namespaces.join(', ') || 'none'}`)
  }

  const search: Search = {
    ctx,
    // Every namespace by default: a match hiding in a namespace nobody named is the whole problem.
    namespaces: options.ns ? [options.ns] : ctx.rm.namespaces,
    locales: options.locale ? [requireLocale(ctx, options.locale)] : ctx.rm.allLocales,
    narrowed: Boolean(options.locale),
    inheriting: new Set(partialOverridesOf(ctx.config.styleguide?.localeRules).map((override) => override.locale)),
    limit: requireCount(options.limit, '--limit', DEFAULT_LIMIT),
  }

  const results = queries.map((query) => ({ query, matched: matchesFor(search, query) }))

  // One scan covering every key about to be printed: reading the source is the expensive half, and
  // two queries landing on the same message must not pay for it twice.
  const shown = results.flatMap((result) => result.matched.slice(0, search.limit))
  const keys = [...new Map(shown.map((key) => [qualifyKey(key.ns, key.keypath), key])).values()]
  const scan = await scanUsages(ctx, keys)

  results.forEach(({ query, matched }, index) => {
    if (index) console.log('')
    printMatches(search, scan, query, matched)
  })
}
