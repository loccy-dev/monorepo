import { describe, expect, it } from 'vitest'
import {
  deserializeValue,
  flattenObject,
  getLineIndex,
  isKeypathExcluded,
  s,
  serializeValue,
  sortObjectKeys,
  truncate,
} from './helpers'

describe('serializeValue', () => {
  it('serializes arrays to a JSON string', () => {
    expect(serializeValue([1, 2, 3])).toBe('[1,2,3]')
  })

  it('leaves non-array values untouched', () => {
    expect(serializeValue('hi')).toBe('hi')
    expect(serializeValue(42)).toBe(42)
    expect(serializeValue(null)).toBe(null)
  })
})

describe('deserializeValue', () => {
  it('parses a JSON array string back into an array', () => {
    expect(deserializeValue('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('leaves a non-array JSON string untouched', () => {
    expect(deserializeValue('{"a":1}')).toBe('{"a":1}')
  })

  it('leaves a plain string untouched', () => {
    expect(deserializeValue('hello')).toBe('hello')
  })

  it('leaves malformed array-like strings untouched', () => {
    expect(deserializeValue('[1,2,')).toBe('[1,2,')
  })

  it('leaves non-string values untouched', () => {
    expect(deserializeValue(42)).toBe(42)
    expect(deserializeValue(null)).toBe(null)
  })
})

describe('flattenObject', () => {
  it('flattens nested objects into dot-separated keys', () => {
    expect(flattenObject({ a: { b: { c: 'hi' } }, d: 'ho' })).toEqual({ 'a.b.c': 'hi', d: 'ho' })
  })

  it('serializes arrays to JSON strings instead of recursing', () => {
    expect(flattenObject({ a: [1, 2, 3] })).toEqual({ a: '[1,2,3]' })
  })

  it('keeps primitive leaves as-is', () => {
    expect(flattenObject({ a: 1, b: true, c: null })).toEqual({ a: 1, b: true, c: null })
  })
})

describe('getLineIndex', () => {
  it('returns 0 when position is on the first line', () => {
    expect(getLineIndex('hello\nworld', 3)).toBe(0)
  })

  it('counts newlines before the position', () => {
    expect(getLineIndex('a\nb\nc', 4)).toBe(2)
  })

  it('returns 0 for position 0', () => {
    expect(getLineIndex('a\nb', 0)).toBe(0)
  })
})

describe('sortObjectKeys', () => {
  it('sorts keys alphabetically', () => {
    expect(sortObjectKeys({ b: 1, a: 2 })).toEqual({ a: 2, b: 1 })
    expect(Object.keys(sortObjectKeys({ b: 1, a: 2 }))).toEqual(['a', 'b'])
  })

  it('sorts nested objects recursively', () => {
    expect(Object.keys(sortObjectKeys({ z: { d: 1, c: 2 } }).z)).toEqual(['c', 'd'])
  })

  it('leaves array order untouched but sorts array items', () => {
    expect(sortObjectKeys([{ b: 1, a: 2 }])).toEqual([{ a: 2, b: 1 }])
  })

  it('passes through primitives and null', () => {
    expect(sortObjectKeys('x')).toBe('x')
    expect(sortObjectKeys(null)).toBe(null)
  })
})

describe('s', () => {
  it('returns empty string for 1', () => {
    expect(s(1)).toBe('')
  })

  it('returns suffix for counts greater than 1', () => {
    expect(s(2)).toBe('s')
  })

  it('returns suffix for 0', () => {
    expect(s(0)).toBe('s')
  })

  it('supports a custom suffix', () => {
    expect(s(2, 'es')).toBe('es')
  })
})

describe('truncate', () => {
  it('leaves short strings untouched', () => {
    expect(truncate('hello', 10)).toBe('hello')
  })

  it('truncates and adds an ellipsis when over the max', () => {
    expect(truncate('hello world', 8)).toBe('hello w…')
  })

  it('respects exact-length strings', () => {
    expect(truncate('hello', 5)).toBe('hello')
  })
})

describe('isKeypathExcluded', () => {
  it('matches an exact key', () => {
    expect(isKeypathExcluded('common:button.save', ['common:button.save'])).toBe(true)
  })

  it('does not match a key nested under a plain pattern (no implicit prefix match)', () => {
    expect(isKeypathExcluded('common:button.save.label', ['common:button.save'])).toBe(false)
  })

  it('matches nested keys when the pattern has an explicit `.*` glob', () => {
    expect(isKeypathExcluded('common:button.save.label', ['common:button.save.*'])).toBe(true)
  })

  it('does not match a plain pattern as a substring', () => {
    expect(isKeypathExcluded('common:button.savepoint', ['common:button.save'])).toBe(false)
  })

  it('does not match unrelated keys', () => {
    expect(isKeypathExcluded('common:button.cancel', ['common:button.save'])).toBe(false)
  })

  it('matches via a glob pattern', () => {
    expect(isKeypathExcluded('common:button.save', ['common:button.*'])).toBe(true)
  })

  it('matches a bare keypath with no namespace', () => {
    expect(isKeypathExcluded('save', ['save'])).toBe(true)
  })

  it('matches when any pattern in the list matches', () => {
    expect(isKeypathExcluded('common:button.save', ['other.key', 'common:button.save'])).toBe(true)
  })

  it('returns false for an empty pattern list', () => {
    expect(isKeypathExcluded('common:button.save', [])).toBe(false)
  })
})
