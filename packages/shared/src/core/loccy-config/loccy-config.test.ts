import { describe, it, expect } from 'vitest'
import type { ActiveFrameworkId } from '@repo/types/framework.types'
import { readConfigFile, resolveConfig, LoccyConfigError } from './loccy-config'
import { makeConfig, makePlatform } from './test-fixtures'

const detected = makeConfig(
  {},
  {
    framework: 'react-i18next',
    usages: { include: ['src/**/*.tsx'] },
    translations: {
      glob: 'public/locales/**/*.json',
      layout: '{locale}/{namespace}.json',
      messageFormat: 'suffix-cldr',
    },
  },
)

describe('resolveConfig', () => {
  it('uses detected values when the user overrides nothing', () => {
    const { default: m } = resolveConfig({}, detected).modules
    expect(m.framework).toBe('react-i18next')
    expect(m.translations.glob).toBe('public/locales/**/*.json')
    expect(m.translations.layout).toBe('{locale}/{namespace}.json')
    expect(m.usages.include).toEqual(['src/**/*.tsx'])
  })

  it('resolves an explicit multi-module config', () => {
    const config = resolveConfig(
      {
        modules: {
          frontend: {
            framework: 'vue-i18n',
            translations: { glob: 'app/locales/*.json', layout: '{locale}.json' },
            usages: { include: ['app/**/*.vue'] },
          },
          backend: {
            translations: { glob: 'srv/i18n/*.json', layout: '{locale}.json', sortKeys: false },
            usages: { include: ['srv/**/*.ts'], customTFunctions: ['translateFromDb'] },
          },
        },
      },
      detected,
    )
    expect(Object.keys(config.modules)).toEqual(['frontend', 'backend'])
    expect(config.modules.frontend!.framework).toBe('vue-i18n')
    expect(config.modules.backend!.framework).toBe('custom') // no framework → custom
    expect(config.modules.backend!.usages.customTFunctions).toEqual(['translateFromDb'])
  })

  it('leaves src.include empty for a translations-only module (no src block)', () => {
    const config = resolveConfig(
      {
        modules: {
          frontend: {
            framework: 'vue-i18n',
            translations: { glob: 'app/locales/*.json', layout: '{locale}.json' },
            usages: { include: ['app/**/*.vue'] },
          },
          // no `src` → translations-only; must NOT borrow the placeholder default glob
          emails: {
            translations: { glob: 'src/emails/**/*.properties', layout: '{locale}.properties' },
          },
        },
      },
      detected,
    )
    expect(config.modules.emails!.usages.include).toEqual([])
    expect(config.modules.frontend!.usages.include).toEqual(['app/**/*.vue'])
  })

  it('requires glob on an explicit module (no placeholder guess) and does not gap-fill from detection', () => {
    // explicit modules are authoritative: a module without a glob is an error, not a disk guess
    expect(() => resolveConfig({ modules: { emails: { framework: 'vue-i18n' } } }, detected)).toThrow(LoccyConfigError)
    // ...and an explicit module never inherits the detected `default` module's glob
    const { emails } = resolveConfig(
      { modules: { emails: { translations: { glob: 'mail/*.properties', layout: '{locale}.properties' } } } },
      detected,
    ).modules
    expect(emails!.translations.glob).toBe('mail/*.properties') // not detected's public/locales/**
    expect(emails!.framework).toBe('custom')
  })

  it('falls back to static defaults when detected is null', () => {
    const { default: m } = resolveConfig({}, null).modules
    expect(m.framework).toBe('custom')
    expect(m.translations.glob).toBe('src/locales/**/*.json')
    expect(m.translations.layout).toBe('{locale}.json')
    expect(m.usages.include).toEqual(['**/*.{js,ts,jsx,tsx,vue}'])
    expect(m.usages.detectKeysInStrings).toBe(true)
  })

  it('fills lint defaults on their axis but keeps user overrides', () => {
    const def = resolveConfig({}, detected).modules.default!
    expect(def.translations.noUntranslatedKeys).toBe(true)
    expect(def.translations.sortKeys).toBe(false)
    expect(def.usages.noUnresolvedKeys).toBe(true)
    expect(def.usages.noUnusedKeys).toBe(true)

    // an explicit module is authoritative — lint overrides require the full module spec (glob etc.)
    const overridden = resolveConfig(
      {
        modules: {
          default: {
            translations: { glob: 'i18n/*.json', layout: '{locale}.json', sortKeys: true },
            usages: { include: ['src/**/*.ts'], noUnusedKeys: false },
          },
        },
      },
      detected,
    ).modules.default!
    expect(overridden.translations.sortKeys).toBe(true)
    expect(overridden.usages.noUnusedKeys).toBe(false)
  })

  it('sets styleguide.localeRules overrides only when provided', () => {
    expect(resolveConfig({}, detected).styleguide?.localeRules).toBeUndefined()
    expect(resolveConfig({ styleguide: { localeRules: {} } }, detected).styleguide?.localeRules).toEqual({})
    expect(
      resolveConfig({ styleguide: { localeRules: { 'de-CH': { extends: 'de' } } } }, detected).styleguide?.localeRules,
    ).toEqual({ 'de-CH': { extends: 'de' } })
  })

  it('throws when a localeRules override entry is missing `extends` or self-referential', () => {
    expect(() =>
      resolveConfig({ styleguide: { localeRules: { 'de-CH': { extends: '' } } as never } }, detected),
    ).toThrow(LoccyConfigError)
    expect(() => resolveConfig({ styleguide: { localeRules: { de: { extends: 'de' } } } }, detected)).toThrow(
      LoccyConfigError,
    )
  })

  it('resolves styleguide with nested glossary / doNotTranslate', () => {
    const config = resolveConfig(
      {
        styleguide: {
          voice: 'Warm, plain language.',
          localeRules: { 'de-CH': { extends: 'de', style: 'ß → ss' } },
          keys: 'Group by feature.',
          glossary: [{ definition: 'The entity', terms: { en: 'Reservation', de: 'Reservierung' } }],
          doNotTranslate: [{ term: 'Whisker Café', caseSensitive: true }],
        },
      },
      detected,
    )
    expect(config.styleguide).toEqual({
      voice: 'Warm, plain language.',
      localeRules: { 'de-CH': { extends: 'de', style: 'ß → ss' } },
      keys: 'Group by feature.',
      glossary: [{ definition: 'The entity', terms: { en: 'Reservation', de: 'Reservierung' } }],
      doNotTranslate: [{ term: 'Whisker Café', caseSensitive: true }],
    })
  })

  it('drops pre-rename styleguide fields instead of failing', () => {
    const config = resolveConfig(
      { styleguide: { global: 'Warm.', code: 'By feature.', locales: { de: 'Du' }, voice: 'Plain.' } },
      detected,
    )
    expect(config.styleguide).toEqual({ voice: 'Plain.' })
  })

  it('leaves styleguide absent when not provided', () => {
    expect(resolveConfig({}, detected).styleguide).toBeUndefined()
  })

  it('treats a null styleguide (all fields commented out in YAML) the same as absent', () => {
    expect(resolveConfig({ styleguide: null } as never, detected).styleguide).toBeUndefined()
  })

  it('throws on an invalid framework', () => {
    // Deliberately invalid — simulates a hand-edited config with a typo'd/unregistered framework id.
    const framework = 'angular-i18n' as ActiveFrameworkId
    expect(() => resolveConfig({ modules: { default: { framework } } }, detected)).toThrow(LoccyConfigError)
  })

  it('does not throw when modules are absent (re-detected/defaulted)', () => {
    expect(() => resolveConfig({}, null)).not.toThrow()
  })
})

describe('readConfigFile', () => {
  it('returns null when the config file is absent and nothing is detected', async () => {
    expect(await readConfigFile(makePlatform({}))).toBeNull()
  })

  it('resolves an explicit default-module file', async () => {
    const platform = makePlatform({
      'loccy.yaml': `
modules:
  default:
    framework: vue-i18n
    translations:
      glob: src/locales/*.json
      layout: "{locale}.json"
    usages:
      include: ["src/**/*.vue"]
styleguide:
  localeRules:
    de-CH:
      extends: de
`,
    })
    const config = await readConfigFile(platform)
    expect(config?.styleguide?.localeRules).toEqual({ 'de-CH': { extends: 'de' } })
    expect(config?.modules.default).toEqual({
      name: 'default',
      framework: 'vue-i18n',
      usages: {
        include: ['src/**/*.vue'],
        exclude: [],
        customTFunctions: [],
        detectKeysInStrings: true,
        quoteType: undefined,
        defaultNamespace: undefined,
        noUnresolvedKeys: true,
        noUnusedKeys: true,
      },
      translations: {
        messageFormat: 'vue-pipe',
        glob: 'src/locales/*.json',
        layout: '{locale}.json',
        exclude: [],
        noUntranslatedKeys: true,
        checkPlurals: true,
        sortKeys: false,
      },
    })
  })

  it('parses styleguide with nested glossary / doNotTranslate from the same file', async () => {
    const platform = makePlatform({
      'loccy.yaml': `
modules:
  default:
    framework: vue-i18n
    translations:
      glob: src/locales/*.json
styleguide:
  voice: Warm, plain language.
  localeRules:
    de: Always informal du.
  glossary:
    - definition: The entity, not the verb
      terms:
        en: Reservation
        de: Reservierung
  doNotTranslate:
    - term: Whisker Café
      caseSensitive: true
`,
    })
    const config = await readConfigFile(platform)
    expect(config?.styleguide?.voice).toBe('Warm, plain language.')
    expect(config?.styleguide?.localeRules).toEqual({ de: 'Always informal du.' })
    expect(config?.styleguide?.glossary).toEqual([
      { definition: 'The entity, not the verb', terms: { en: 'Reservation', de: 'Reservierung' } },
    ])
    expect(config?.styleguide?.doNotTranslate).toEqual([{ term: 'Whisker Café', caseSensitive: true }])
  })

  it('throws on an unknown framework', async () => {
    const platform = makePlatform({
      'loccy.yaml': `modules:\n  default:\n    framework: angular-i18n\n`,
    })
    await expect(readConfigFile(platform)).rejects.toThrow(LoccyConfigError)
  })

  it('throws on invalid YAML', async () => {
    const platform = makePlatform({ 'loccy.yaml': `framework: "unterminated` })
    await expect(readConfigFile(platform)).rejects.toThrow(LoccyConfigError)
  })

  it('treats an all-comments file (fresh scaffold, nothing uncommented) as no overrides', async () => {
    const platform = makePlatform({
      'loccy.yaml': '# framework: react-i18next\n# translations:\n#   glob: x\n',
    })
    await expect(readConfigFile(platform)).resolves.not.toThrow()
  })
})
