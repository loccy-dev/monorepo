import type { LocalizedText } from '@repo/types/primitives.types'
import type { GlossaryLocaleValue, StyleguideConfig } from '@repo/types/config.types'
import { deprecatedForms, preferredForm } from '@repo/types/config.types'

export interface ComplianceIssue {
  locale: string
  message: string
}

function contains(haystack: string, needle: string, caseSensitive: boolean): boolean {
  return caseSensitive ? haystack.includes(needle) : haystack.toLowerCase().includes(needle.toLowerCase())
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
 * Do-not-translate terms one locale keeps and another dropped. Symmetric between locales on purpose:
 * these terms are identical everywhere, so any value using one puts every other value under the same
 * rule, with no locale privileged over the rest.
 */
export function checkDoNotTranslate(
  values: LocalizedText,
  styleguide: StyleguideConfig | undefined,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  const entries = written(values)

  for (const term of styleguide?.doNotTranslate ?? []) {
    const caseSensitive = term.caseSensitive ?? false
    const holders = entries.filter(([, value]) => contains(value, term.term, caseSensitive))
    if (!holders.length) continue

    for (const [locale, value] of entries) {
      if (contains(value, term.term, caseSensitive)) continue
      issues.push({
        locale,
        message: `"${term.term}" must stay verbatim, and the ${locale} value drops it (${holders.map(([code]) => code).join(', ')} keep${holders.length === 1 ? 's' : ''} it)`,
      })
    }
  }

  return issues
}

/**
 * Glossary terms a locale spells with a deprecated form, or leaves out while another locale uses the
 * same entry. The second half is approximate: morphology means a correctly translated message can
 * carry the term in an inflected form the plain string never matches, so callers report advice.
 */
export function checkGlossary(values: LocalizedText, styleguide: StyleguideConfig | undefined): ComplianceIssue[] {
  const issues: ComplianceIssue[] = []
  const entries = written(values)

  for (const entry of styleguide?.glossary ?? []) {
    const forms = new Map(entries.map(([locale]) => [locale, localeTerm(entry.terms, locale)]))

    for (const [locale, value] of entries) {
      for (const deprecated of deprecatedForms(forms.get(locale) ?? '')) {
        if (contains(value, deprecated, false)) {
          issues.push({
            locale,
            message: `"${deprecated}" is deprecated for ${entry.definition}, use "${preferredForm(forms.get(locale)!)}"`,
          })
        }
      }
    }

    // In play for this message when some locale already renders the concept by its approved form.
    const inPlay = entries.some(([locale, value]) => {
      const preferred = preferredForm(forms.get(locale) ?? '')
      return preferred && contains(value, preferred, false)
    })
    if (!inPlay) continue

    for (const [locale, value] of entries) {
      const preferred = preferredForm(forms.get(locale) ?? '')
      if (!preferred || contains(value, preferred, false)) continue
      issues.push({ locale, message: `${entry.definition}: the ${locale} value should use "${preferred}"` })
    }
  }

  return issues
}
