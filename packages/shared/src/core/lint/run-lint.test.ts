import { describe, expect, it } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { makeModule, makePlatform } from '../loccy-config/test-fixtures'
import { summarizeLint, type LintFinding, type ModuleLintReport } from './lint-findings'
import { checkUntranslatedKeys, checkUsages, type TranslationEntry } from './run-lint'

const entry = (over: Partial<TranslationEntry>): TranslationEntry => ({
  keypath: 'k',
  locale: 'en',
  ns: '',
  translation: 'v',
  file: 'en.json',
  ...over,
})

/** The counts the old return shape carried, recovered from the findings. */
function counts(findings: LintFinding[]): { fixable: number; nonFixable: number } {
  return {
    fixable: findings.filter((finding) => finding.fixable).length,
    nonFixable: findings.filter((finding) => !finding.fixable).length,
  }
}

const usageModule = makeModule({ usages: { include: ['src/**/*.ts'], detectKeysInStrings: false } })

/** A platform over in-memory files, recording writes and failing the paths named in `failWrites`. */
function recordingPlatform(files: Record<string, string>, failWrites: string[] = [], failReads: string[] = []) {
  const written: Record<string, string> = {}
  const platform: Platform = {
    rootPath: '/',
    async deleteFile(path) {
      delete files[path]
    },
    async readFile(path) {
      if (failReads.includes(path)) throw new Error('permission denied')
      const content = files[path]
      if (content === undefined) throw new Error(`no such file: ${path}`)
      return content
    },
    async writeFile(path, content) {
      if (failWrites.includes(path)) throw new Error('disk full')
      written[path] = content
    },
    exists: async (path) => path in files,
    findFiles: async () => [...new Set([...Object.keys(files), ...failReads])],
  }
  return { platform, written }
}

describe('checkUsages', () => {
  it('reports an unused key as fixable without touching disk when not running --fix', async () => {
    const platform = makePlatform({ 'en.json': '{"greeting":{"hello":"Hi"}}' })
    const translations = [entry({ keypath: 'greeting.hello', translation: 'Hi' })]

    const result = await checkUsages(platform, usageModule, translations, false)

    expect(counts(result.findings)).toEqual({ fixable: 1, nonFixable: 0 })
    expect(result.fixedCount).toBe(0)
    expect(result.findings[0]).toMatchObject({ rule: 'noUnusedKeys', kind: 'unused', key: 'greeting.hello' })
  })

  it('surfaces a scanner crash as a manual-fix issue instead of a false clean pass', async () => {
    const platform: Platform = {
      rootPath: '/',
      readFile: () => Promise.reject(new Error('not needed')),
      writeFile: () => Promise.reject(new Error('not needed')),
      deleteFile: () => Promise.reject(new Error('not needed')),
      exists: () => Promise.resolve(false),
      findFiles: () => Promise.reject(new Error('bad glob pattern')),
    }

    const result = await checkUsages(platform, makeModule({ usages: { include: ['src/**/*.ts'] } }), [], false)

    expect(counts(result.findings)).toEqual({ fixable: 0, nonFixable: 1 })
    expect(result.findings[0]).toMatchObject({ rule: 'scan', kind: 'scan-failed' })
  })

  it('--fix does not count a key as fixed when writing its file back fails, and flags it for manual fix', async () => {
    const { platform, written } = recordingPlatform(
      { 'en.json': '{"greeting":{"hello":"Hi"}}', 'fr.json': '{"farewell":{"bye":"Au revoir"}}' },
      ['fr.json'],
    )
    const translations = [
      entry({ keypath: 'greeting.hello', translation: 'Hi' }),
      entry({ keypath: 'farewell.bye', locale: 'fr', translation: 'Au revoir', file: 'fr.json' }),
    ]

    const result = await checkUsages(platform, usageModule, translations, true)

    // en.json's key was removed and persisted, so it counts as fixed. fr.json's write threw, so its
    // key is still on disk and must not.
    expect(result.fixedCount).toBe(1)
    expect(result.findings.filter((finding) => finding.kind === 'unused')).toMatchObject([
      { key: 'farewell.bye', removalFailed: true, fixable: false },
    ])
    expect(written['en.json']).not.toContain('hello')
    expect(written['fr.json']).toBeUndefined()
  })

  it('--fix does not count a key as fixed when it is only removed from some of the files it appears in', async () => {
    const { platform, written } = recordingPlatform(
      { 'en.json': '{"greeting":{"hello":"Hi"}}', 'fr.json': '{"greeting":{"hello":"Bonjour"}}' },
      ['fr.json'],
    )
    const translations = [
      entry({ keypath: 'greeting.hello', translation: 'Hi' }),
      entry({ keypath: 'greeting.hello', locale: 'fr', translation: 'Bonjour', file: 'fr.json' }),
    ]

    const result = await checkUsages(platform, usageModule, translations, true)

    // Deleted and written in en.json, but fr.json's write threw, so the key is still live there.
    expect(result.fixedCount).toBe(0)
    expect(result.findings.filter((finding) => finding.kind === 'unused')).toMatchObject([
      { key: 'greeting.hello', removalFailed: true },
    ])
    expect(written['en.json']).not.toContain('hello')
    expect(written['fr.json']).toBeUndefined()
  })

  it('--fix does not count a key as fixed when a module file could not be read, even if every readable file removed it', async () => {
    const { platform, written } = recordingPlatform({ 'fr.json': '{"greeting":{"hello":"Bonjour"}}' }, [], ['en.json'])
    const translations = [entry({ keypath: 'greeting.hello', locale: 'fr', translation: 'Bonjour', file: 'fr.json' })]

    const result = await checkUsages(platform, usageModule, translations, true)

    // en.json could not be read, so it might hold the key too: not fixed, and flagged for a human.
    expect(result.fixedCount).toBe(0)
    expect(result.findings.filter((finding) => finding.kind === 'unused')).toMatchObject([
      { key: 'greeting.hello', removalFailed: true },
    ])
    // The unreadable file is reported in its own right, so the reason is never silent.
    expect(result.findings.filter((finding) => finding.kind === 'io-failed')).toHaveLength(1)
    expect(written['fr.json']).not.toContain('hello')
  })
})

describe('summarizeLint', () => {
  const report = (findings: LintFinding[], fixedCount = 0): ModuleLintReport => ({
    module: 'default',
    findings,
    fixedCount,
    detectedLocales: ['en'],
    checkedLocales: ['en'],
  })
  const unused = (key: string): LintFinding => ({
    rule: 'noUnusedKeys',
    kind: 'unused',
    module: 'default',
    key,
    fixable: true,
  })
  const manual = (key: string): LintFinding => ({
    rule: 'noUnresolvedKeys',
    kind: 'unresolved',
    module: 'default',
    key,
    locations: [],
    fixable: false,
  })

  it('does not let a fixed count suppress unrelated issues that still need a human', () => {
    const summary = summarizeLint([report([manual('a'), manual('b'), manual('c')], 10)])
    expect(summary).toMatchObject({ totalIssues: 3, remainingFixable: 0, fixedCount: 10 })
  })

  it('counts outstanding fixable issues alongside the ones needing a human', () => {
    const summary = summarizeLint([report([unused('a'), unused('b'), manual('c')])])
    expect(summary).toMatchObject({ totalIssues: 3, remainingFixable: 2 })
  })

  it('reports a clean run once every fixable issue found was actually fixed', () => {
    // Fixed keys are gone, so they leave no finding behind.
    expect(summarizeLint([report([], 10)])).toMatchObject({ totalIssues: 0, remainingFixable: 0, fixedCount: 10 })
  })

  it('adds up across modules', () => {
    const summary = summarizeLint([report([unused('a')]), { ...report([manual('b')]), module: 'admin' }])
    expect(summary.totalIssues).toBe(2)
  })
})

describe('checkUntranslatedKeys', () => {
  const module = makeModule({})

  it('flags a key present in one locale but missing in another', () => {
    const findings = checkUntranslatedKeys(
      [
        entry({ keypath: 'a', locale: 'en' }),
        entry({ keypath: 'b', locale: 'en' }),
        entry({ keypath: 'a', locale: 'fr' }),
      ],
      module,
    )
    expect(findings).toMatchObject([{ kind: 'missing', key: 'b' }])
  })

  it('only compares across detected locales, so a single-locale project has nothing to flag', () => {
    expect(checkUntranslatedKeys([entry({ keypath: 'a' }), entry({ keypath: 'b' })], module)).toEqual([])
  })

  it('flags an empty-string translation as untranslated', () => {
    const findings = checkUntranslatedKeys(
      [entry({ keypath: 'a', locale: 'en' }), entry({ keypath: 'a', locale: 'fr', translation: '  ' })],
      module,
    )
    expect(findings).toMatchObject([{ kind: 'empty', key: 'a' }])
  })

  it('reports a module whose glob matched no locale rather than passing it silently', () => {
    expect(checkUntranslatedKeys([], module)).toMatchObject([{ rule: 'scan', kind: 'no-locales' }])
  })

  it('checks only the locales the rule names, ignoring the rest', () => {
    const scoped = makeModule({ translations: { noUntranslatedKeys: ['en'] } })
    const findings = checkUntranslatedKeys(
      [entry({ keypath: 'a', locale: 'en' }), entry({ keypath: 'b', locale: 'fr' })],
      scoped,
    )
    expect(findings).toMatchObject([{ kind: 'missing', key: 'b', locales: [{ locale: 'en', value: null }] }])
  })

  it('leaves a deliberately incomplete locale alone once the rule stops naming it', () => {
    const scoped = makeModule({ translations: { noUntranslatedKeys: ['de'] } })
    const translations = [
      entry({ keypath: 'a', locale: 'de' }),
      entry({ keypath: 'b', locale: 'de' }),
      entry({ keypath: 'a', locale: 'de-CH' }),
    ]
    expect(checkUntranslatedKeys(translations, scoped)).toEqual([])
    // The default rule has no styleguide to consult, so de-CH's gap is a finding until it's scoped out.
    expect(checkUntranslatedKeys(translations, module)).toMatchObject([{ kind: 'missing', key: 'b' }])
  })

  it('treats an empty locale list as an opt-out, not as a module with no locales', () => {
    const none = makeModule({ translations: { noUntranslatedKeys: [] } })
    expect(checkUntranslatedKeys([entry({ keypath: 'a' })], none)).toEqual([])
    expect(checkUntranslatedKeys([], none)).toEqual([])
  })

  it('carries every locale value, so a renderer can show the key filled in and blank side by side', () => {
    const findings = checkUntranslatedKeys(
      [
        entry({ keypath: 'a', locale: 'en', translation: 'Hi' }),
        entry({ keypath: 'a', locale: 'fr', translation: '' }),
      ],
      module,
    )
    expect(findings[0]).toMatchObject({
      locales: [
        { locale: 'en', value: 'Hi' },
        { locale: 'fr', value: '' },
      ],
    })
  })
})
