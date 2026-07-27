import { describe, it, expect } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { initializeConfig, initializeConfigFiles } from './initialize-config'
import { makePlatform } from './test-fixtures'

describe('initializeConfig — auto-detection leniency', () => {
  it('falls back to the custom framework when resource files exist but no framework dep is present', async () => {
    const platform = makePlatform({
      'src/locales/en.json': '{"greeting":"Hi"}',
      'src/locales/de.json': '{"greeting":"Hallo"}',
    })
    const config = await initializeConfig(platform)
    expect(config).not.toBeNull()
    expect(config!.modules.default!.framework).toBe('custom')
    expect(config!.modules.default!.translations.glob).toContain('src/locales')
  })

  it('returns null when no resource files are found', async () => {
    const platform = makePlatform({ 'package.json': '{"dependencies":{}}' })
    expect(await initializeConfig(platform)).toBeNull()
  })
})

/** Adds write capture to `makePlatform`'s read-only mock — `initializeConfigFiles` needs `writeFile`. */
function makeWritablePlatform(files: Record<string, string>): { platform: Platform; written: Record<string, string> } {
  const written: Record<string, string> = {}
  const platform: Platform = {
    ...makePlatform(files),
    async writeFile(path: string, content: string) {
      written[path] = content
    },
  }
  return { platform, written }
}

describe('initializeConfigFiles', () => {
  it('skips an existing loccy.yaml without writing', async () => {
    const { platform, written } = makeWritablePlatform({ 'loccy.yaml': 'modules: {}' })
    const result = await initializeConfigFiles(platform)
    expect(result).toEqual({ created: [], skipped: ['loccy.yaml'], usedPlaceholder: false })
    expect(written).toEqual({})
  })

  it('writes the detected config when auto-detection succeeds', async () => {
    const { platform, written } = makeWritablePlatform({
      'src/locales/en.json': '{"greeting":"Hi"}',
      'src/locales/de.json': '{"greeting":"Hallo"}',
    })
    const result = await initializeConfigFiles(platform)
    expect(result).toEqual({ created: ['loccy.yaml'], skipped: [], usedPlaceholder: false })
    expect(written['loccy.yaml']).toContain('framework: custom')
  })

  it('falls back to the placeholder config when nothing is detected', async () => {
    const { platform, written } = makeWritablePlatform({})
    const result = await initializeConfigFiles(platform)
    expect(result).toEqual({ created: ['loccy.yaml'], skipped: [], usedPlaceholder: true })
    expect(written['loccy.yaml']).toContain('framework: custom')
  })
})
