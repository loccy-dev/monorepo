import { describe, expect, it } from 'vitest'
import {
  getLocaleRank,
  getSortedLocales,
  isLocaleLike,
  looksLikeLocaleStructure,
  looksLikeNamespaceStructure,
} from './locale.helpers'

describe('getLocaleRank', () => {
  it('ranks supported locales by their position in allSupportedLanguages', () => {
    expect(getLocaleRank('en')).toBe(0)
    expect(getLocaleRank('es')).toBeGreaterThan(getLocaleRank('en'))
  })

  it('ranks unknown locales last', () => {
    expect(getLocaleRank('xx-unknown')).toBeGreaterThan(getLocaleRank('es'))
  })
})

describe('getSortedLocales', () => {
  it('sorts locales by supported-language rank', () => {
    expect(getSortedLocales(['fr', 'en', 'es'])).toEqual(['en', 'es', 'fr'])
  })

  it('puts unsupported locales at the end', () => {
    expect(getSortedLocales(['xx-unknown', 'en'])).toEqual(['en', 'xx-unknown'])
  })

  it('does not mutate the input array', () => {
    const input = ['fr', 'en']
    getSortedLocales(input)
    expect(input).toEqual(['fr', 'en'])
  })
})

describe('isLocaleLike', () => {
  it('accepts curated language codes', () => {
    expect(isLocaleLike('en')).toBe(true)
    expect(isLocaleLike('zh-CN')).toBe(true)
  })

  it('is case-insensitive against the curated list', () => {
    expect(isLocaleLike('EN')).toBe(true)
    expect(isLocaleLike('en-us')).toBe(true)
  })

  it('accepts underscored variants', () => {
    expect(isLocaleLike('en_US')).toBe(true)
  })

  it('accepts unlisted codes matching the fallback pattern', () => {
    expect(isLocaleLike('xx-YY')).toBe(true)
  })

  it('rejects strings shorter than 2 chars', () => {
    expect(isLocaleLike('a')).toBe(false)
    expect(isLocaleLike('')).toBe(false)
  })

  it('rejects strings longer than 15 chars', () => {
    expect(isLocaleLike('a'.repeat(16))).toBe(false)
  })

  it('rejects malformed codes', () => {
    expect(isLocaleLike('common')).toBe(false)
    expect(isLocaleLike('en-USA')).toBe(false)
  })
})

describe('looksLikeNamespaceStructure', () => {
  it('detects locale-named directory with non-locale filename', () => {
    expect(looksLikeNamespaceStructure('/en/common.json')).toBe(true)
    expect(looksLikeNamespaceStructure('/zh-CN/auth.json')).toBe(true)
  })

  it('rejects locale-named filename regardless of directory', () => {
    expect(looksLikeNamespaceStructure('/messages/en.json')).toBe(false)
  })

  it('rejects non-locale directory and filename', () => {
    expect(looksLikeNamespaceStructure('/messages/common.json')).toBe(false)
  })
})

describe('looksLikeLocaleStructure', () => {
  it('detects locale-named filename with non-locale directory', () => {
    expect(looksLikeLocaleStructure('/messages/en.json')).toBe(true)
    expect(looksLikeLocaleStructure('/locales/fr.json')).toBe(true)
  })

  it('rejects locale-named directory regardless of filename', () => {
    expect(looksLikeLocaleStructure('/en/common.json')).toBe(false)
  })

  it('rejects non-locale directory and filename', () => {
    expect(looksLikeLocaleStructure('/messages/common.json')).toBe(false)
  })
})
