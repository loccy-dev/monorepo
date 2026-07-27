// Helpers shared by value-locus message-format codecs, operating on the canonical `PluralModel`.

import type {
  PluralBranchKey,
  PluralCategory,
  PluralIssue,
  PluralModel,
  PluralNumberType,
} from '@repo/types/plurals.types'
import type { PluralValueCodec } from '../contracts'
import { PLURAL_CATEGORIES, getPluralCategories } from './plural-categories'

/**
 * Branch keys in canonical emit order: exact-match keys (`=0`, `=1`) first by value, then CLDR
 * categories in canonical order, `other` always last. Only keys present in `branches` are returned.
 */
export function orderedBranchKeys(branches: PluralModel['branches']): PluralBranchKey[] {
  const keys = Object.keys(branches) as PluralBranchKey[]
  const exacts = keys.filter((k) => k.startsWith('=')).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)))
  const categories = PLURAL_CATEGORIES.filter((c) => c !== 'other' && keys.includes(c))
  const other: PluralBranchKey[] = keys.includes('other') ? ['other'] : []
  return [...exacts, ...categories, ...other]
}

/**
 * Report categories a model fails to define. `requireOther` additionally demands `other`
 * unconditionally, for callers where it's mandatory regardless of locale.
 */
export function validateBranches(
  model: PluralModel,
  required: PluralCategory[],
  { requireOther }: { requireOther: boolean },
): PluralIssue[] {
  const issues: PluralIssue[] = []
  for (const category of required) {
    if (model.branches[category] === undefined) {
      issues.push(category === 'other' ? { kind: 'missing-other' } : { kind: 'missing-category', category })
    }
  }
  if (requireOther && !required.includes('other') && model.branches['other'] === undefined) {
    issues.push({ kind: 'missing-other' })
  }
  return issues
}

/**
 * Map positional (selectorless) segments to canonical branches using the LOCALE's own CLDR
 * categories in canonical order — so English `a | b` is one/other while Russian `a | b | c | d` is
 * one/few/many/other. One extra leading segment is vue/Laravel's "zero" idiom (`=0`).
 */
export function positionalBranches(
  segments: string[],
  locale: string,
  numberType: PluralNumberType = 'cardinal',
): PluralModel['branches'] {
  const resolved = getPluralCategories([locale], numberType)
  const cats = resolved.length ? resolved : (['one', 'other'] as PluralCategory[])
  const branches: PluralModel['branches'] = {}
  // One more segment than the locale has categories → a leading `=0` (count-zero) segment.
  if (segments.length === cats.length + 1) {
    branches['=0'] = segments[0]
    cats.forEach((category, i) => (branches[category] = segments[i + 1]!))
    return branches
  }
  segments.forEach((segment, i) => {
    const category = cats[i]
    if (category) branches[category] = segment
  })
  return branches
}

/**
 * `requiredCategories`/`validate` defaults for CLDR-keyed value codecs: categories come straight
 * from CLDR, `other` always mandatory. Not for codecs whose per-locale arity diverges from CLDR.
 */
export const cldrValueCodecDefaults: Pick<PluralValueCodec, 'requiredCategories' | 'validate'> = {
  requiredCategories: (locale, numberType) => getPluralCategories([locale], numberType),

  validate: (model, locale, numberType) =>
    validateBranches(model, getPluralCategories([locale], numberType), { requireOther: true }),
}
