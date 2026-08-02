import type { DoNotTranslateEntry, GlossaryEntry, LoccyConfig } from '@repo/types/config.types'
import { deprecatedForms, preferredForm } from '@repo/types/config.types'

/** The styleguide sections of the config the prompt builder consumes (glossary/dnt live inside). */
export type StyleguideBundle = Pick<LoccyConfig, 'styleguide'>

/** The declared terms that stay verbatim, one line each. */
function buildDoNotTranslateMarkdown(doNotTranslate: DoNotTranslateEntry[]): string {
  return doNotTranslate
    .map((entry) => {
      const caseNote = entry.caseSensitive ? ' (case-sensitive — preserve exact casing)' : ''
      const definition = entry.definition ? ` — ${entry.definition}` : ''
      return `- "${entry.term}" stays verbatim${caseNote}${definition}`
    })
    .join('\n')
}

/** Serialize the glossary for LLM prompt consumption, scoped to `targetLocales` (plus
 * `sourceLocale`, so the model can match the term against the source text) — an entry with no term
 * in any of those locales is dropped. */
function buildGlossaryMarkdown(glossary: GlossaryEntry[], targetLocales: string[], sourceLocale?: string): string {
  const lines: string[] = []

  const locales = sourceLocale ? [sourceLocale, ...targetLocales.filter((l) => l !== sourceLocale)] : targetLocales
  for (const entry of glossary) {
    const perLocale = locales
      .map((loc) => {
        const localeValue = entry.terms[loc] ?? entry.terms[loc.split('-')[0]!]
        if (!localeValue) return null
        const preferred = preferredForm(localeValue)
        if (!preferred) return null
        const deprecated = deprecatedForms(localeValue)
        const deprecatedNote = deprecated.length ? `, never: ${deprecated.join(', ')}` : ''
        const sourceNote = loc === sourceLocale ? ' (source)' : ''
        return `${loc} → ${preferred}${sourceNote}${deprecatedNote}`
      })
      .filter(Boolean)
    if (!perLocale.length) continue
    lines.push(`- ${entry.definition}: ${perLocale.join('; ')}`)
  }

  return lines.join('\n')
}

/** Resolve per-locale prose, falling back to the base language (`de` for `de-CH`). Partial-override
 * entries (`{extends, style}`) carry no prose of their own — they're excluded from the base-locale
 * loop upstream, but guard here too since a fallback could still land on one. */
export function localeProse(bundle: StyleguideBundle, locale: string): string {
  const localeRules = bundle.styleguide?.localeRules
  const value = localeRules?.[locale] ?? localeRules?.[locale.split('-')[0]!]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Compose the config's styleguide sections into prompt-ready markdown, scoped to
 * `targetLocales`: product, voice and mechanics, relevant per-locale rules, and glossary.
 * `sourceLocale` (when given and not already among `targetLocales`) adds the source-language term
 * to each glossary entry, so the model can match the term against the source text — it does not
 * get its own per-locale prose section.
 * Returns an empty string when the styleguide contributes nothing for these locales.
 * The caller wraps this in its own `<styleguide>` framing.
 */
export function buildStyleguidePrompt(
  bundle: StyleguideBundle,
  targetLocales: string[],
  sourceLocale?: string,
): string {
  const sections: string[] = []

  const styleguide = bundle.styleguide
  if (styleguide?.product?.trim()) sections.push(`## product\n${styleguide.product.trim()}`)
  if (styleguide?.voice?.trim()) sections.push(`## voice\n${styleguide.voice.trim()}`)
  if (styleguide?.mechanics?.trim()) sections.push(`## mechanics\n${styleguide.mechanics.trim()}`)

  for (const locale of targetLocales) {
    const prose = localeProse(bundle, locale)
    if (prose) sections.push(`## localeRules.${locale}\n${prose}`)
  }

  const doNotTranslate = buildDoNotTranslateMarkdown(bundle.styleguide?.doNotTranslate ?? [])
  if (doNotTranslate) sections.push(`## doNotTranslate\n${doNotTranslate}`)

  const glossary = buildGlossaryMarkdown(bundle.styleguide?.glossary ?? [], targetLocales, sourceLocale)
  if (glossary) sections.push(`## glossary\n${glossary}`)

  return sections.join('\n\n')
}
