import { describe, expect, it } from 'vitest'
import { parseResourceFileSafe } from './parse-resource-file-safe'
import { makePlatform } from '../test-fixtures'

describe('parseResourceFileSafe', () => {
  it('parses a valid resource file', async () => {
    const platform = makePlatform({ 'en.json': '{"greeting":"Hi"}' })
    const doc = await parseResourceFileSafe(platform, 'en.json')
    expect(doc?.data).toEqual({ greeting: 'Hi' })
  })

  it('returns null for an unrecognized extension', async () => {
    const platform = makePlatform({ 'notes.txt': 'hello' })
    expect(await parseResourceFileSafe(platform, 'notes.txt')).toBeNull()
  })

  it('returns null for empty content', async () => {
    const platform = makePlatform({ 'en.json': '   ' })
    expect(await parseResourceFileSafe(platform, 'en.json')).toBeNull()
  })

  it('returns null for content that parses to an empty object', async () => {
    const platform = makePlatform({ 'en.json': '{}' })
    expect(await parseResourceFileSafe(platform, 'en.json')).toBeNull()
  })

  it('returns null instead of throwing when the file is missing', async () => {
    const platform = makePlatform({})
    expect(await parseResourceFileSafe(platform, 'missing.json')).toBeNull()
  })
})
