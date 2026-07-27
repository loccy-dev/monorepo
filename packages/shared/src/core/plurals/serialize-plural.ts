// Encode per-locale plural models into the resource entries to write. Value-locus formats yield
// ONE entry (the serialized value at `baseKey`); key-locus formats fan out into one sibling-key
// entry per CLDR category. Downstream the write path treats both identically — a map of
// `{ keypath: { locale: value } }`.

import type { MessageFormat } from '../contracts'
import type { PluralModel } from '@repo/types/plurals.types'
import type { LocalizedText } from '@repo/types/primitives.types'
import { PLURAL_CATEGORIES } from './plural-categories'

export function pluralToResourceEntries(
  baseKey: string,
  perLocaleModel: Record<string, PluralModel>,
  messageFormat: MessageFormat,
): Record<string, LocalizedText> {
  const entries: Record<string, LocalizedText> = {}
  const codec = messageFormat.valueCodec

  for (const [locale, model] of Object.entries(perLocaleModel)) {
    if (codec) {
      ;(entries[baseKey] ??= {})[locale] = codec.serializeValue(model, locale)
      continue
    }
    for (const category of PLURAL_CATEGORIES) {
      const value = model.branches[category]
      if (value === undefined) continue
      const keypath = messageFormat.pluralKeyFor!(baseKey, category, model.numberType)
      ;(entries[keypath] ??= {})[locale] = value
    }
  }
  return entries
}
