// --- Plurals ---
// The framework-agnostic substrate every plural syntax reduces to. A concrete on-disk syntax
// (i18next `_one`/`_other` sibling keys, inline ICU `{n, plural, …}`, vue's `a | b | c` pipes)
// is a `MessageFormat` — a (parse, serialize) pair against `PluralModel`.
// See `@repo/shared/core/contracts` and `.../plurals`.

/** Cardinal (1 item, 2 items) vs ordinal (1st, 2nd, 3rd). */
export type PluralNumberType = 'cardinal' | 'ordinal'

/** Unicode CLDR plural categories, in canonical order. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

/** A branch selector: a CLDR category, or an ICU exact-value match (`=0`, `=1`). */
export type PluralBranchKey = PluralCategory | `=${number}`

/**
 * Canonical, syntax-independent plural.
 */
export interface PluralModel {
  numberType: PluralNumberType
  /** The count variable as authored: `count` (i18next), `n` (vue), the ICU arg name. */
  countVar: string
  /** Message template per branch. Iteration order is authoring order. */
  branches: Partial<Record<PluralBranchKey, string>>
}

/** A structural problem found by `MessageFormat.validate`. */
export interface PluralIssue {
  kind: 'missing-category' | 'missing-other' | 'extra-category'
  /** The offending category, when applicable. */
  category?: PluralCategory
}
