import { pattern, regex } from 'regex'
import type { LocalizedText } from '@repo/types/primitives.types'
import type { GlossaryLocaleValue, StyleguideConfig } from '@repo/types/config.types'
import { deprecatedForms, preferredForm } from '@repo/types/config.types'

/** What a word is made of, in the scripts that separate their words. The rest write without spaces. */
const wordChar = pattern`
  [ [\p{L}\p{N}] -- [\p{sc=Han} \p{sc=Hiragana} \p{sc=Katakana} \p{sc=Thai} \p{sc=Lao} \p{sc=Khmer} \p{sc=Mymr}] ]
`
const startsWithWordChar = regex`^${wordChar}`
const notAfterWordChar = pattern(`(?<!${wordChar})`)

/**
 * A term has to start a word: "AI" inside "travail" is a coincidence, not the term. Only the start,
 * so a locale that inflected or pluralised the term still counts as using it. The guard goes away
 * where a word start cannot be told apart, which is a term written in an unspaced script or opening
 * on punctuation.
 */
function contains(haystack: string, needle: string, caseSensitive: boolean): boolean {
  const guard = startsWithWordChar.test(needle) ? notAfterWordChar : pattern('')
  return regex(caseSensitive ? '' : 'i')`${guard}${needle}`.test(haystack)
}

/** Locales carrying text, since an empty value is a deliberate delete rather than a translation. */
function written(values: LocalizedText): [string, string][] {
  return Object.entries(values).filter(([, value]) => value.trim())
}

/** A glossary entry's value for a locale, falling back to the base language (`de` for `de-CH`). */
function localeTerm(terms: Record<string, GlossaryLocaleValue>, locale: string): GlossaryLocaleValue | undefined {
  return terms[locale] ?? terms[locale.split('-')[0]!]
}

/**
 * Locales whose value trips a do-not-translate term another locale keeps. Symmetric between locales
 * on purpose: these terms are identical everywhere, so any value using one puts every other value
 * under the same rule, with no locale privileged over the rest.
 *
 * The locale is all a caller gets: which rule fired it already knows, and the rule as the project
 * authored it says more than any sentence generated from it.
 */
export function checkDoNotTranslate(values: LocalizedText, styleguide: StyleguideConfig | undefined): string[] {
  const flagged = new Set<string>()
  const entries = written(values)

  for (const term of styleguide?.doNotTranslate ?? []) {
    const caseSensitive = term.caseSensitive ?? false
    const holds = ([, value]: [string, string]): boolean => contains(value, term.term, caseSensitive)
    if (!entries.some(holds)) continue

    for (const entry of entries) if (!holds(entry)) flagged.add(entry[0])
  }

  return [...flagged]
}

/**
 * Locales spelling a glossary term by a deprecated form, or leaving it out while another locale uses
 * the same entry. The second half is approximate: morphology means a correctly translated message can
 * carry the term in an inflected form the plain string never matches, so callers report advice.
 */
export function checkGlossary(values: LocalizedText, styleguide: StyleguideConfig | undefined): string[] {
  const flagged = new Set<string>()
  const entries = written(values)

  for (const entry of styleguide?.glossary ?? []) {
    const formFor = (locale: string): GlossaryLocaleValue => localeTerm(entry.terms, locale) ?? ''

    for (const [locale, value] of entries) {
      const deprecated = deprecatedForms(formFor(locale))
      if (deprecated.some((form) => contains(value, form, false))) flagged.add(locale)
    }

    // In play for this message when some locale already renders the concept by its approved form.
    const uses = ([locale, value]: [string, string]): boolean => {
      const preferred = preferredForm(formFor(locale))
      return Boolean(preferred) && contains(value, preferred, false)
    }
    if (!entries.some(uses)) continue

    for (const [locale, value] of entries) {
      if (preferredForm(formFor(locale)) && !uses([locale, value])) flagged.add(locale)
    }
  }

  return [...flagged]
}
