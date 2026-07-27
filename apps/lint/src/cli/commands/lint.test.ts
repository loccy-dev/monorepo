import { describe, expect, it } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { makeModule, makePlatform } from '@repo/shared/core/loccy-config/test-fixtures'
import {
  checkPluralCompleteness,
  checkUntranslatedKeys,
  checkUsages,
  summarizeLintResults,
  type TranslationEntry,
} from './lint'

const entry = (over: Partial<TranslationEntry>): TranslationEntry => ({
  keypath: 'k',
  locale: 'en',
  ns: '',
  translation: 'v',
  file: 'en.json',
  ...over,
})

describe('checkUsages', () => {
  it('reports an unused key as fixable without touching disk when not running --fix', async () => {
    const platform = makePlatform({ 'en.json': '{"greeting":{"hello":"Hi"}}' })
    const module = makeModule({ usages: { include: ['src/**/*.ts'], detectKeysInStrings: false } })
    const translations: TranslationEntry[] = [
      { keypath: 'greeting.hello', locale: 'en', ns: '', translation: 'Hi', file: 'en.json' },
    ]

    const result = await checkUsages(platform, module, translations, false)

    expect(result).toEqual({ fixable: 1, nonFixable: 0, fixed: 0 })
  })

  it('surfaces a scanner crash as a manual-fix issue instead of a false clean pass', async () => {
    const platform: Platform = {
      rootPath: '/',
      readFile: () => Promise.reject(new Error('not needed')),
      writeFile: () => Promise.reject(new Error('not needed')),
      exists: () => Promise.resolve(false),
      findFiles: () => Promise.reject(new Error('bad glob pattern')),
    }
    const module = makeModule({ usages: { include: ['src/**/*.ts'] } })

    const result = await checkUsages(platform, module, [], false)

    expect(result).toEqual({ fixable: 0, nonFixable: 1, fixed: 0 })
  })

  it('--fix does not count a key as fixed when writing its file back fails, and flags it for manual fix', async () => {
    const files: Record<string, string> = {
      'en.json': '{"greeting":{"hello":"Hi"}}',
      'fr.json': '{"farewell":{"bye":"Au revoir"}}',
    }
    const written: Record<string, string> = {}
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      async writeFile(path, content) {
        if (path === 'fr.json') throw new Error('disk full')
        written[path] = content
      },
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ usages: { include: ['src/**/*.ts'], detectKeysInStrings: false } })
    const translations: TranslationEntry[] = [
      { keypath: 'greeting.hello', locale: 'en', ns: '', translation: 'Hi', file: 'en.json' },
      { keypath: 'farewell.bye', locale: 'fr', ns: '', translation: 'Au revoir', file: 'fr.json' },
    ]

    const result = await checkUsages(platform, module, translations, true)

    // en.json's key was actually removed and persisted — counted as fixed.
    // fr.json's write threw, so its key is still on disk — must not be counted as fixed.
    expect(result).toEqual({ fixable: 0, nonFixable: 1, fixed: 1 })
    expect(written['en.json']).not.toContain('hello')
    expect(written['fr.json']).toBeUndefined()
  })

  it('--fix does not count a key as fixed when it is only removed from some of the files it appears in', async () => {
    const files: Record<string, string> = {
      'en.json': '{"greeting":{"hello":"Hi"}}',
      'fr.json': '{"greeting":{"hello":"Bonjour"}}',
    }
    const written: Record<string, string> = {}
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      async writeFile(path, content) {
        if (path === 'fr.json') throw new Error('disk full')
        written[path] = content
      },
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ usages: { include: ['src/**/*.ts'], detectKeysInStrings: false } })
    const translations: TranslationEntry[] = [
      { keypath: 'greeting.hello', locale: 'en', ns: '', translation: 'Hi', file: 'en.json' },
      { keypath: 'greeting.hello', locale: 'fr', ns: '', translation: 'Bonjour', file: 'fr.json' },
    ]

    const result = await checkUsages(platform, module, translations, true)

    // greeting.hello was deleted and written in en.json, but fr.json's write threw — it's still
    // live in fr.json, so the key must not be reported as fixed even though one file succeeded.
    expect(result).toEqual({ fixable: 0, nonFixable: 1, fixed: 0 })
    expect(written['en.json']).not.toContain('hello')
    expect(written['fr.json']).toBeUndefined()
  })

  it('--fix does not count a key as fixed when a module file could not be read, even if every readable file removed it', async () => {
    const files: Record<string, string> = { 'fr.json': '{"greeting":{"hello":"Bonjour"}}' }
    const written: Record<string, string> = {}
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        if (path === 'en.json') throw new Error('permission denied')
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      async writeFile(path, content) {
        written[path] = content
      },
      exists: async (path) => path in files,
      findFiles: async () => ['en.json', 'fr.json'],
    }
    const module = makeModule({ usages: { include: ['src/**/*.ts'], detectKeysInStrings: false } })
    const translations: TranslationEntry[] = [
      { keypath: 'greeting.hello', locale: 'fr', ns: '', translation: 'Bonjour', file: 'fr.json' },
    ]

    const result = await checkUsages(platform, module, translations, true)

    // en.json couldn't be read, so it might also contain greeting.hello — the key must be flagged for
    // manual fix, not reported as fixed, even though fr.json's own delete+write succeeded.
    expect(result).toEqual({ fixable: 0, nonFixable: 1, fixed: 0 })
    expect(written['fr.json']).not.toContain('hello')
  })
})

describe('summarizeLintResults', () => {
  it('does not let a fixed count suppress unrelated non-fixable issues in --fix mode', () => {
    // 10 unused keys auto-removed (fixed=10) plus 3 unrelated missing-translation issues (nonFixable=3)
    // must still fail the run — fixing unused keys can't resolve missing translations.
    expect(summarizeLintResults(0, 3, 10)).toEqual({ totalIssues: 3, remainingFixable: -10 })
  })

  it('counts unfixed fixable issues alongside non-fixable ones outside --fix mode', () => {
    expect(summarizeLintResults(5, 3, 0)).toEqual({ totalIssues: 8, remainingFixable: 5 })
  })

  it('reports a clean run once every fixable issue found was actually fixed', () => {
    expect(summarizeLintResults(10, 0, 10)).toEqual({ totalIssues: 0, remainingFixable: 0 })
  })
})

describe('checkUntranslatedKeys', () => {
  it('flags a key present in one locale but missing in another', () => {
    // both en and fr are detected locales; each key exists in only one → both are incomplete
    const result = checkUntranslatedKeys(
      [
        entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' }),
        entry({ keypath: 'other', locale: 'fr', translation: 'Autre' }),
      ],
      makeModule(),
      [],
    )
    expect(result.nonFixable).toBe(2)
  })

  it('only compares across detected locales (a single-locale project has nothing to flag)', () => {
    const result = checkUntranslatedKeys(
      [entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' })],
      makeModule(),
      [],
    )
    expect(result.nonFixable).toBe(0)
  })

  it('flags an empty-string translation as untranslated', () => {
    const result = checkUntranslatedKeys(
      [
        entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' }),
        entry({ keypath: 'greeting.hello', locale: 'fr', translation: '  ' }),
      ],
      makeModule(),
      [],
    )
    expect(result.nonFixable).toBe(1)
  })

  it('passes when every key is present and non-empty in every locale', () => {
    const result = checkUntranslatedKeys(
      [
        entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' }),
        entry({ keypath: 'greeting.hello', locale: 'fr', translation: 'Salut' }),
      ],
      makeModule(),
      [],
    )
    expect(result.nonFixable).toBe(0)
  })

  it('does not flag keys missing in a partial-override locale (intentionally inherited at runtime)', () => {
    const translations = [
      entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' }),
      entry({ keypath: 'greeting.hello', locale: 'fr', translation: 'Salut' }),
      entry({ keypath: 'extra.key', locale: 'en', translation: 'X' }), // absent in fr
    ]
    expect(checkUntranslatedKeys(translations, makeModule(), []).nonFixable).toBe(1)
    expect(checkUntranslatedKeys(translations, makeModule(), ['fr']).nonFixable).toBe(0)
  })

  it('is a no-op when noUntranslatedKeys is disabled', () => {
    const result = checkUntranslatedKeys(
      [entry({ keypath: 'greeting.hello', locale: 'en', translation: 'Hi' }), entry({ keypath: 'x', locale: 'fr' })],
      makeModule({ translations: { noUntranslatedKeys: false } }),
      [],
    )
    expect(result.nonFixable).toBe(0)
  })
})

describe('checkPluralCompleteness', () => {
  it('value-locus (icu): flags a plural missing categories the locale requires', () => {
    const result = checkPluralCompleteness(
      [
        entry({ keypath: 'items', locale: 'en', translation: '{count, plural, one {# item} other {# items}}' }),
        entry({ keypath: 'items', locale: 'ru', translation: '{count, plural, one {# товар} other {# товаров}}' }),
      ],
      makeModule({ translations: { messageFormat: 'icu' } }),
      [],
    )
    // English one/other is complete; Russian requires few/many too → flagged.
    expect(result.nonFixable).toBe(1)
  })

  it('value-locus (icu): passes a fully-specified plural and ignores plain strings', () => {
    const result = checkPluralCompleteness(
      [
        entry({ keypath: 'items', locale: 'en', translation: '{count, plural, one {# item} other {# items}}' }),
        entry({ keypath: 'greeting', locale: 'en', translation: 'Hello' }),
      ],
      makeModule({ translations: { messageFormat: 'icu' } }),
      [],
    )
    expect(result.nonFixable).toBe(0)
  })

  it('key-locus (suffix-cldr): flags a base whose locale lacks required CLDR categories', () => {
    const result = checkPluralCompleteness(
      [
        entry({ keypath: 'items_one', locale: 'en', translation: '# item' }),
        entry({ keypath: 'items_other', locale: 'en', translation: '# items' }),
        entry({ keypath: 'items_one', locale: 'ru', translation: '# товар' }),
      ],
      makeModule({ translations: { messageFormat: 'suffix-cldr' } }),
      [],
    )
    // 'items' has ≥2 categories → confidently a plural; ru only has 'one' → missing few/many/other.
    expect(result.nonFixable).toBe(1)
  })

  it('key-locus (suffix-cldr): a lone _one sibling is not treated as a plural', () => {
    const result = checkPluralCompleteness(
      [entry({ keypath: 'step_one', locale: 'en', translation: 'First step' })],
      makeModule({ translations: { messageFormat: 'suffix-cldr' } }),
      [],
    )
    expect(result.nonFixable).toBe(0)
  })
})
