// vue-pipe — vue-i18n's native plural syntax: `|`-separated positional segments,
// `"no apples | one apple | {count} apples"`. Value-locus. Segments map to the target LOCALE's CLDR
// categories in canonical order (English → one/other; Russian → one/few/many/other), matching a
// vue-i18n `pluralRules` function; a leading extra segment is vue's `=0` (count-zero) idiom.

import type { MessageFormat, PluralValueCodec } from '../contracts'
import { cldrValueCodecDefaults, orderedBranchKeys, positionalBranches } from '../plurals/plural-model'

const vuePipeValueCodec: PluralValueCodec = {
  parseValue(value, locale) {
    const segments = value.split('|').map((s) => s.trim())
    if (segments.length < 2) return null // no pipe → not a plural
    return { numberType: 'cardinal', countVar: 'count', branches: positionalBranches(segments, locale) }
  },

  // Emit every branch positionally in canonical order (`=0` first, then one/few/many/other) — one
  // segment per form the locale requires, so few/many are never dropped.
  serializeValue(model) {
    return orderedBranchKeys(model.branches)
      .map((key) => model.branches[key])
      .join(' | ')
  },

  ...cldrValueCodecDefaults,
}

export const vuePipeMessageFormat: MessageFormat = {
  id: 'vue-pipe',
  interpolation: { open: '{', close: '}' },
  expandPluralKeypaths: (baseKey) => [baseKey],
  valueCodec: vuePipeValueCodec,
}
