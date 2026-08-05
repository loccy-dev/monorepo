import type { LocalizedText } from '@repo/types/primitives.types'
import type { StyleguideConfig } from '@repo/types/config.types'
import { partialOverridesOf } from '@repo/types/config.types'

/** Locales that must carry their own value — everything not configured as a partial override. */
export function primaryLocales(allLocales: string[], styleguide: StyleguideConfig | undefined): string[] {
  const overrides = new Set(partialOverridesOf(styleguide?.localeRules).map((o) => o.locale))
  return allLocales.filter((locale) => !overrides.has(locale))
}

export interface RedundantOverride {
  locale: string
  extends: string
  value: string
}

/**
 * Partial-override locales whose value repeats the locale they extend. Such a value adds nothing:
 * omitted, the key inherits the same text at runtime. The extended locale's text is taken from this
 * call when present, else from `storedValueFor`, so an override repeating an already-stored parent
 * value is caught too.
 */
export function findRedundantOverrides(
  values: LocalizedText,
  styleguide: StyleguideConfig | undefined,
  storedValueFor: (locale: string) => string | undefined = () => undefined,
): RedundantOverride[] {
  const redundant: RedundantOverride[] = []
  for (const override of partialOverridesOf(styleguide?.localeRules)) {
    const value = values[override.locale]?.trim()
    if (!value) continue
    const parentValue = (values[override.extends] ?? storedValueFor(override.extends))?.trim()
    if (parentValue && value === parentValue) {
      redundant.push({ locale: override.locale, extends: override.extends, value })
    }
  }
  return redundant
}
