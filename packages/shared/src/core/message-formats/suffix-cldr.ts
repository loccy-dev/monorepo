// suffix-cldr — the i18next family's default: a plural spans CLDR sibling KEYS
// (`key_one`, `key_other`, `key_ordinal_one`, …). Key-locus, so no value codec — completeness
// is "do the required category keys exist per locale", handled at the key level.

import type { MessageFormat, PluralKeypathContext } from '../contracts'
import type { PluralCategory } from '@repo/types/plurals.types'
import { getPluralCategories, PLURAL_CATEGORIES } from '../plurals/plural-categories'

function suffixFor(category: string, numberType: PluralKeypathContext['numberType']): string {
  return numberType === 'ordinal' ? `_ordinal_${category}` : `_${category}`
}

export const suffixCldrMessageFormat: MessageFormat = {
  id: 'suffix-cldr',
  interpolation: { open: '{{', close: '}}' },

  pluralKeyFor: (baseKey, category, numberType) => `${baseKey}${suffixFor(category, numberType)}`,

  parsePluralKey(keypath) {
    for (const category of PLURAL_CATEGORIES) {
      const numberType = keypath.endsWith(`_ordinal_${category}`)
        ? ('ordinal' as const)
        : keypath.endsWith(`_${category}`)
          ? ('cardinal' as const)
          : null
      if (numberType) {
        return {
          baseKey: keypath.slice(0, -suffixFor(category, numberType).length),
          category: category as PluralCategory,
          numberType,
        }
      }
    }
    return null
  },

  expandPluralKeypaths(baseKey, { numberType, locales, existingKeypaths }) {
    const categories = getPluralCategories(locales, numberType)
    // i18next special rule: `_zero` is honored (beyond CLDR) only when such a key already exists.
    const withZero =
      !categories.includes('zero') && existingKeypaths.includes(this.pluralKeyFor!(baseKey, 'zero', numberType))
        ? (['zero', ...categories] as const)
        : categories
    return withZero.map((category) => this.pluralKeyFor!(baseKey, category, numberType))
  },

  // No valueCodec: suffix-cldr's plural lives across sibling keys, not inside a single value.
}
