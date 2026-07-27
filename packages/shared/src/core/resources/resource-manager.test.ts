import { describe, it, expect } from 'vitest'
import { ResourceManager } from './resource-manager'
import { NS_WITHOUT_NS } from '../helpers/namespace.helpers'

// Regression coverage for the class of bug that shipped: a `.properties` module with a per-locale
// layout map whose files were mis-read with their FILENAMES as locales. This exercises the exact
// path the IDE converges onto (parseLayout + glob-prefix stripping inside ResourceManager).
const propsConfig = {
  layout: { en: 'welcome.properties', '*': 'welcome_{locale}.properties' },
  defaultNs: NS_WITHOUT_NS,
  sortKeys: false,
  i18nFramework: 'custom' as const,
  globPattern: 'src/emails/**/*.properties',
}

const propsFiles = [
  { relativePath: 'src/emails/welcome.properties', content: 'subject=Welcome\nbody=Hello' },
  { relativePath: 'src/emails/welcome_de.properties', content: 'subject=Willkommen\nbody=Hallo' },
  { relativePath: 'src/emails/welcome_ru.properties', content: 'subject=Privet\nbody=Zdravstvuy' },
]

describe('ResourceManager — per-locale .properties layout', () => {
  it('resolves each file to its layout locale, not its filename', () => {
    const rm = new ResourceManager(propsConfig, propsFiles)
    expect(rm.allLocales.sort()).toEqual(['de', 'en', 'ru'])

    const map = rm.getFileLocaleMap()
    expect(map.get('src/emails/welcome.properties')).toEqual({ locale: 'en', namespace: NS_WITHOUT_NS })
    expect(map.get('src/emails/welcome_de.properties')).toEqual({ locale: 'de', namespace: NS_WITHOUT_NS })
    expect(map.get('src/emails/welcome_ru.properties')).toEqual({ locale: 'ru', namespace: NS_WITHOUT_NS })
  })

  it('groups translations per keypath across the real locales', () => {
    const rm = new ResourceManager(propsConfig, propsFiles)
    const perKeypath = rm.mergedFlatTranslationsPerKeypath
    expect(perKeypath['subject']).toEqual({ en: 'Welcome', de: 'Willkommen', ru: 'Privet' })
  })

  it('writes an edited value into the correct locale file', () => {
    const rm = new ResourceManager(propsConfig, propsFiles)
    const changes = rm.updateValue('subject', { de: 'Willkommen zurueck' })
    expect([...changes.keys()]).toEqual(['src/emails/welcome_de.properties'])
    expect(changes.get('src/emails/welcome_de.properties')).toContain('Willkommen zurueck')
  })

  it('creates a new locale file via the fallback pattern', () => {
    const rm = new ResourceManager(propsConfig, propsFiles)
    const changes = rm.updateValue('subject', { fr: 'Bienvenue' })
    expect([...changes.keys()]).toEqual(['src/emails/welcome_fr.properties'])
  })
})

describe('ResourceManager — updateKeypaths (multi-keypath plural write)', () => {
  const jsonConfig = {
    layout: '{locale}.json',
    defaultNs: NS_WITHOUT_NS,
    sortKeys: false,
    i18nFramework: 'custom' as const,
    globPattern: 'locales/*.json',
  }

  it('writes several sibling keys across locales, merging per-file content', () => {
    const rm = new ResourceManager(jsonConfig, [
      { relativePath: 'locales/en.json', content: '{}' },
      { relativePath: 'locales/ru.json', content: '{}' },
    ])
    const changes = rm.updateKeypaths({
      items_one: { en: 'one item', ru: 'odin' },
      items_few: { ru: 'neskolko' },
      items_other: { en: '{{count}} items', ru: 'mnogo' },
    })
    expect(new Set(changes.keys())).toEqual(new Set(['locales/en.json', 'locales/ru.json']))
    // each locale file carries ALL its sibling keys (cumulative parser mutation), not just the last
    expect(JSON.parse(changes.get('locales/en.json')!)).toEqual({
      items_one: 'one item',
      items_other: '{{count}} items',
    })
    expect(JSON.parse(changes.get('locales/ru.json')!)).toEqual({
      items_one: 'odin',
      items_few: 'neskolko',
      items_other: 'mnogo',
    })
  })
})

describe('ResourceManager — isolation (no cross-module bleed)', () => {
  // Two managers, same locale `en` and same namespace, but different keyspaces. Building them
  // separately proves the per-module model keeps their data apart (the IDE's single global model
  // did NOT — it deep-merged both under merged['en']['_']).
  it('keeps two modules’ keyspaces separate', () => {
    const frontend = new ResourceManager(
      {
        layout: '{locale}.json',
        defaultNs: NS_WITHOUT_NS,
        sortKeys: false,
        i18nFramework: 'vue-i18n',
        globPattern: 'src/locales/*.json',
      },
      [{ relativePath: 'src/locales/en.json', content: '{"greeting":"Hi"}' }],
    )
    const backend = new ResourceManager(propsConfig, propsFiles)

    expect(Object.keys(frontend.mergedFlatTranslationsPerKeypath)).toEqual(['greeting'])
    expect(Object.keys(backend.mergedFlatTranslationsPerKeypath).sort()).toEqual(['body', 'subject'])
    // frontend has no `subject`; backend has no `greeting`
    expect(frontend.mergedFlatTranslationsPerKeypath['subject']).toBeUndefined()
    expect(backend.mergedFlatTranslationsPerKeypath['greeting']).toBeUndefined()
  })
})
