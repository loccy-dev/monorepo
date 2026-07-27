// Plural completeness against the canonical model — the single source for "which categories does
// this locale still owe", shared by CLI lint and IDE annotations. Honours the locus split: a
// value-locus plural lives in one value (parse + validate it); a key-locus plural spans sibling
// keys (existence is checked by the caller against `requiredPluralCategories`).

import type { MessageFormat } from '../contracts'
import type { PluralCategory, PluralNumberType } from '@repo/types/plurals.types'
import { getPluralCategories } from './plural-categories'

/** CLDR categories `locale` must define under `messageFormat` — codec-driven, else CLDR default. */
export function requiredPluralCategories(
  locale: string,
  messageFormat: MessageFormat,
  numberType: PluralNumberType,
): PluralCategory[] {
  return messageFormat.valueCodec?.requiredCategories(locale, numberType) ?? getPluralCategories([locale], numberType)
}

/**
 * Value-locus: categories the stored plural value fails to define for `locale`. Empty for
 * key-locus formats (no `valueCodec`) and for values that aren't a plural at all.
 */
export function missingValuePluralCategories(
  value: string,
  locale: string,
  messageFormat: MessageFormat,
  numberType: PluralNumberType,
): PluralCategory[] {
  const codec = messageFormat.valueCodec
  if (!codec) return []
  const model = value ? codec.parseValue(value, locale) : null
  if (!model) return []
  return codec.validate(model, locale, numberType).map((issue) => issue.category ?? 'other')
}
