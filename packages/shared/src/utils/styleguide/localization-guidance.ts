import type { StyleguideConfig } from '@repo/types/config.types'
import { partialOverridesOf } from '@repo/types/config.types'
import { buildStyleguidePrompt, localeProse } from './styleguide-prompt'

/**
 * A partial-override binding — `locale` extends `extends` per a natural-language rule. Filled only
 * where the rule deviates, else empty. `extends` is an explicit config pick, not derived from
 * BCP-47 naming.
 *
 * @lintignore
 */
export type RegionalOverrideSpec = {
  /** The partial-override locale, e.g. "de-CH". */
  locale: string
  /** Locale it extends, e.g. "de". */
  extends: string
  /** Diff-style deviation rule in plain language: when to deviate from the extended locale, when to inherit. */
  rule: string
  /** Full prose styleguide of the extended locale, so the override is translated with the same style context as its parent. */
  parentStyle: string
}

/**
 * Locale a locale is configured to extend, when that locale is visible in `visibleLocales`, or
 * null if it isn't a configured override or the extended locale is absent from this run.
 */
function overrideParentFor(
  styleguide: StyleguideConfig | undefined,
  locale: string,
  visibleLocales: string[],
): string | null {
  const override = partialOverridesOf(styleguide?.locales).find((o) => o.locale === locale)
  if (!override) return null
  return visibleLocales.includes(override.extends) ? override.extends : null
}

/**
 * Specs for target locales configured as partial overrides. Only emitted when the extended locale
 * is visible in this run (a target being generated, or in `contextLocales`) — otherwise the locale
 * is translated normally with no override instruction sent.
 */
function buildRegionalOverrideSpecs(
  styleguide: StyleguideConfig | undefined,
  targetLocales: string[],
  contextLocales: string[],
): RegionalOverrideSpec[] {
  const overrides = partialOverridesOf(styleguide?.locales)
  if (!overrides.length) return []
  const visible = [...new Set([...targetLocales, ...contextLocales])]
  const specs: RegionalOverrideSpec[] = []
  for (const locale of targetLocales) {
    const extendsLocale = overrideParentFor(styleguide, locale, visible)
    if (!extendsLocale) continue
    const rule = overrides.find((o) => o.locale === locale)?.style ?? ''
    const parentStyle = localeProse({ styleguide }, extendsLocale)
    specs.push({ locale, extends: extendsLocale, rule, parentStyle })
  }
  return specs
}

/**
 * Styleguide prose + override specs for one AI call, scoped to `targetLocales` (`contextLocales`
 * only widen override visibility). Overrides go out ONLY as structured specs — dropped from
 * the prose — so the caller's override-resolution step owns them exclusively.
 *
 * @lintignore
 */
export function resolveLocalizationGuidance(
  styleguide: StyleguideConfig | undefined,
  targetLocales: string[],
  contextLocales: string[] = [],
): { styleguideText?: string; regionalOverrides?: RegionalOverrideSpec[] } {
  const regionalOverrides = buildRegionalOverrideSpecs(styleguide, targetLocales, contextLocales)
  const overrideLocales = new Set(regionalOverrides.map((s) => s.locale))
  const baseLocales = targetLocales.filter((l) => !overrideLocales.has(l))
  const styleguideText = buildStyleguidePrompt({ styleguide }, baseLocales, contextLocales[0])
  return {
    styleguideText: styleguideText || undefined,
    regionalOverrides: regionalOverrides.length ? regionalOverrides : undefined,
  }
}
