import { describe, it, expect } from 'vitest'
import {
  parseOrganization,
  buildPathFromOrganization,
  hasNamespace,
  parseLayout,
  buildPathFromLayout,
  layoutHasNamespace,
} from './organization-parser'

describe('parseOrganization', () => {
  it('parses locale-only patterns', () => {
    expect(parseOrganization('{locale}.json', 'en.json')).toEqual({ locale: 'en', namespace: undefined })
  })

  it('parses locale + single-segment namespace', () => {
    expect(parseOrganization('{locale}/{namespace}.json', 'en/common.json')).toEqual({
      locale: 'en',
      namespace: 'common',
    })
  })

  it('parses greedy {namespace}** across multiple path segments', () => {
    expect(parseOrganization('{locale}/{namespace}**.json', 'en/a/b/c.json')).toEqual({
      locale: 'en',
      namespace: 'a/b/c',
    })
  })

  it('captures region variants (de-CH)', () => {
    expect(parseOrganization('{locale}.json', 'de-CH.json')).toEqual({ locale: 'de-CH', namespace: undefined })
    expect(parseOrganization('{locale}/{namespace}.json', 'pt-BR/home.json')).toEqual({
      locale: 'pt-BR',
      namespace: 'home',
    })
  })

  it('treats a literal dot as a dot, not a wildcard', () => {
    // `enXjson` must NOT match `{locale}.json`
    expect(parseOrganization('{locale}.json', 'enXjson')).toBeNull()
  })

  it('returns null when the path does not match the pattern', () => {
    expect(parseOrganization('{locale}/{namespace}.json', 'en.json')).toBeNull()
    expect(parseOrganization('{locale}.json', 'en.yaml')).toBeNull()
  })

  it('handles literal `*` in a pattern as a non-slash wildcard', () => {
    expect(parseOrganization('{locale}/{namespace}**.json', 'en/deep/nested/key.json')).toEqual({
      locale: 'en',
      namespace: 'deep/nested/key',
    })
  })
})

describe('buildPathFromOrganization', () => {
  it('is the inverse of parseOrganization for locale-only', () => {
    expect(buildPathFromOrganization('{locale}.json', 'en')).toBe('en.json')
  })

  it('fills locale + namespace', () => {
    expect(buildPathFromOrganization('{locale}/{namespace}.json', 'de', 'common')).toBe('de/common.json')
  })

  it('fills greedy namespace with slashes preserved', () => {
    expect(buildPathFromOrganization('{locale}/{namespace}**.json', 'en', 'a/b/c')).toBe('en/a/b/c.json')
  })

  it('leaves a pattern without {locale} untouched by the locale', () => {
    expect(buildPathFromOrganization('welcome.properties', 'en')).toBe('welcome.properties')
  })
})

describe('hasNamespace', () => {
  it('detects the namespace placeholder', () => {
    expect(hasNamespace('{locale}/{namespace}.json')).toBe(true)
    expect(hasNamespace('{locale}/{namespace}**.json')).toBe(true)
    expect(hasNamespace('{locale}.json')).toBe(false)
    expect(hasNamespace('welcome_{locale}.properties')).toBe(false)
  })
})

describe('parseLayout — string form', () => {
  it('delegates to parseOrganization', () => {
    expect(parseLayout('{locale}/{namespace}.json', 'fr/auth.json')).toEqual({ locale: 'fr', namespace: 'auth' })
  })
})

describe('parseLayout — per-locale map form (the cat-cafe .properties case)', () => {
  // The exact shape that shipped the original bug: a specific-locale pattern WITHOUT {locale}
  // (locale comes from the map key), plus a `*` fallback that carries {locale}.
  const layout = { en: 'welcome.properties', '*': 'welcome_{locale}.properties' }

  it('resolves the no-{locale} entry via its map key', () => {
    expect(parseLayout(layout, 'welcome.properties')).toEqual({ locale: 'en', namespace: undefined })
  })

  it('resolves other locales through the `*` fallback', () => {
    expect(parseLayout(layout, 'welcome_de.properties')).toEqual({ locale: 'de', namespace: undefined })
    expect(parseLayout(layout, 'welcome_ru.properties')).toEqual({ locale: 'ru', namespace: undefined })
  })

  it('resolves region variants through the fallback', () => {
    expect(parseLayout(layout, 'welcome_de-CH.properties')).toEqual({ locale: 'de-CH', namespace: undefined })
  })

  it('returns null for a file that matches no entry', () => {
    expect(parseLayout(layout, 'unrelated.txt')).toBeNull()
  })

  it('prefers a specific-locale entry over the `*` fallback', () => {
    // `en` must resolve via the specific entry (namespace undefined), never re-derived by `*`.
    const withNs = { en: 'en/common.json', '*': '{locale}/{namespace}.json' }
    expect(parseLayout(withNs, 'en/common.json')).toEqual({ locale: 'en', namespace: undefined })
    expect(parseLayout(withNs, 'de/common.json')).toEqual({ locale: 'de', namespace: 'common' })
  })
})

describe('buildPathFromLayout', () => {
  it('string form is a straight org build', () => {
    expect(buildPathFromLayout('{locale}/{namespace}.json', 'en', 'common')).toBe('en/common.json')
  })

  it('map form: specific-locale entry wins', () => {
    const layout = { en: 'welcome.properties', '*': 'welcome_{locale}.properties' }
    expect(buildPathFromLayout(layout, 'en')).toBe('welcome.properties')
  })

  it('map form: falls back to `*` for unlisted locales', () => {
    const layout = { en: 'welcome.properties', '*': 'welcome_{locale}.properties' }
    expect(buildPathFromLayout(layout, 'de')).toBe('welcome_de.properties')
    expect(buildPathFromLayout(layout, 'de-CH')).toBe('welcome_de-CH.properties')
  })

  it('round-trips with parseLayout for every locale in the map', () => {
    const layout = { en: 'welcome.properties', '*': 'welcome_{locale}.properties' }
    for (const locale of ['en', 'de', 'ru', 'de-CH']) {
      const path = buildPathFromLayout(layout, locale)
      expect(parseLayout(layout, path)?.locale).toBe(locale)
    }
  })
})

describe('layoutHasNamespace', () => {
  it('is true when any pattern carries {namespace}', () => {
    expect(layoutHasNamespace('{locale}/{namespace}.json')).toBe(true)
    expect(layoutHasNamespace({ en: 'en/common.json', '*': '{locale}/{namespace}.json' })).toBe(true)
  })

  it('is false when no pattern carries {namespace}', () => {
    expect(layoutHasNamespace('{locale}.json')).toBe(false)
    expect(layoutHasNamespace({ en: 'welcome.properties', '*': 'welcome_{locale}.properties' })).toBe(false)
  })
})
