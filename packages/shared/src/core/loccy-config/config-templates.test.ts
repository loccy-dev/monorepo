import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'
import { renderLoccyConfigYaml } from './config-templates'
import { placeholderConfig } from './initialize-config'
import { makeConfig } from './test-fixtures'

describe('renderLoccyConfigYaml', () => {
  const config = makeConfig(
    {},
    {
      framework: 'react-i18next',
      usages: { include: ['src/**/*.{tsx,ts}'] },
      translations: { glob: 'public/locales/**/*.json', layout: '{locale}/{namespace}.json' },
    },
  )

  it('emits the real detected config; omits a framework-default layout; styleguide fields stay commented', () => {
    const parsed = load(renderLoccyConfigYaml(config)) as {
      modules: Record<string, Record<string, unknown>>
      styleguide?: unknown
    }
    const module = parsed.modules.default!
    expect(module.framework).toBe('react-i18next')
    expect(module.usages).toEqual({ include: ['src/**/*.{tsx,ts}'] })
    // Layout is react-i18next's default (`{locale}/{namespace}.json`) → omitted (re-derived each run).
    // messageFormat `icu` is NOT the default (`suffix-cldr`) → must be spelled out, or the reader
    // re-derives `suffix-cldr` and silently flips plural semantics.
    expect(module.translations).toEqual({ glob: 'public/locales/**/*.json', messageFormat: 'icu' })
    // the styleguide scaffold is commented out whole, so nothing of it parses
    expect(parsed.styleguide).toBeUndefined()
  })

  it('omits a framework-default messageFormat', () => {
    // suffix-cldr IS react-i18next's default (messageFormats[0]) → re-derived, so omitted.
    const dflt = makeConfig({}, { framework: 'react-i18next', translations: { messageFormat: 'suffix-cldr' } })
    const parsed = load(renderLoccyConfigYaml(dflt)) as {
      modules: Record<string, { translations: Record<string, unknown> }>
    }
    expect(parsed.modules.default!.translations.messageFormat).toBeUndefined()
  })

  it('spells out a non-default layout', () => {
    // per-locale layout is NOT react-i18next's convention → must be written out
    const nonDefault = makeConfig({}, { framework: 'react-i18next', translations: { layout: '{locale}.json' } })
    const parsed = load(renderLoccyConfigYaml(nonDefault)) as {
      modules: Record<string, { translations: Record<string, unknown> }>
    }
    expect(parsed.modules.default!.translations.layout).toBe('{locale}.json')
  })

  it('starts with the schema header and docs link', () => {
    const yaml = renderLoccyConfigYaml(config)
    expect(yaml).toContain('# yaml-language-server: $schema=https://loccy.dev/schemas/config.schema.json')
  })

  it('emits the styleguide scaffold fully commented out', () => {
    const yaml = renderLoccyConfigYaml(placeholderConfig)
    expect(yaml).toContain('\n# styleguide:\n')
    expect(yaml).toContain('#   glossary:')
    expect(yaml).toContain('#   doNotTranslate:')
  })
})
