// Canonical CLDR plural-category resolution. Every consumer resolves required categories through
// this one function — never reimplement the lookup.

import type { PluralCategory, PluralNumberType } from '@repo/types/plurals.types'
/** CLDR plural categories in canonical order. */
export const PLURAL_CATEGORIES: readonly PluralCategory[] = ['zero', 'one', 'two', 'few', 'many', 'other']

/**
 * The plural categories a set of locales collectively requires, via `Intl.PluralRules`.
 *
 * Examples:
 * - English cardinal: `['one', 'other']`
 * - English ordinal: `['one', 'two', 'few', 'other']`
 * - Arabic cardinal: `['zero', 'one', 'two', 'few', 'many', 'other']`
 */
export function getPluralCategories(locales: string[], numberType: PluralNumberType = 'cardinal'): PluralCategory[] {
  const categories = new Set<string>()
  for (const locale of locales) {
    try {
      const rules = new Intl.PluralRules(locale, { type: numberType })
      rules.resolvedOptions().pluralCategories.forEach((c) => categories.add(c))
    } catch {
      // invalid locale, skip
    }
  }
  return PLURAL_CATEGORIES.filter((c) => categories.has(c))
}
