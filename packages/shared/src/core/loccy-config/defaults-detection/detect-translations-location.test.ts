import { describe, expect, it } from 'vitest'
import { detectTranslationsLocation } from './detect-translations-location'
import { makePlatform } from '../test-fixtures'

describe('detectTranslationsLocation', () => {
  it('returns no candidates when nothing looks like a resource file', async () => {
    const platform = makePlatform({ 'src/config.json': '{"port":3000}' })
    expect(await detectTranslationsLocation(platform)).toEqual([])
  })

  it('returns no candidates for an empty project', async () => {
    expect(await detectTranslationsLocation(makePlatform({}))).toEqual([])
  })

  it('ranks a conventionally-named locale dir above an unconventional one', async () => {
    const platform = makePlatform({
      'locales/en.json': '{"greeting":"hi"}',
      'locales/de.json': '{"greeting":"hallo"}',
      'randomdir/en.json': '{"greeting":"hi"}',
    })
    const candidates = await detectTranslationsLocation(platform)
    expect(candidates[0]!.dir).toBe('locales')
    expect(candidates.map((c) => c.dir)).toContain('randomdir')
  })

  it('groups namespace-structured files (locale dir, namespace filename) under their shared parent', async () => {
    const platform = makePlatform({
      'locales/en/common.json': '{"greeting":"hi"}',
      'locales/de/common.json': '{"greeting":"hallo"}',
    })
    const candidates = await detectTranslationsLocation(platform)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.dir).toBe('locales')
    expect(candidates[0]!.paths).toEqual(['locales/en/common.json', 'locales/de/common.json'])
  })
})
