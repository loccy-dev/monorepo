import { describe, expect, it } from 'vitest'
import { detectSortKeysFromDocument, resolveSortKeys } from './detect-sort-keys'

describe('detectSortKeysFromDocument', () => {
  it('true for alphabetically sorted keys', () => {
    expect(detectSortKeysFromDocument({ flatData: { apple: '1', banana: '2', cherry: '3' } })).toBe(true)
  })

  it('false for unsorted keys', () => {
    expect(detectSortKeysFromDocument({ flatData: { banana: '2', apple: '1' } })).toBe(false)
  })
})

describe('resolveSortKeys', () => {
  it('honors an explicit override even when data is unsorted', () => {
    expect(resolveSortKeys({ banana: '2', apple: '1' }, true)).toBe(true)
  })

  it('falls back to auto-detection when no override is given', () => {
    expect(resolveSortKeys({ apple: '1', banana: '2' }, undefined)).toBe(true)
    expect(resolveSortKeys({ banana: '2', apple: '1' }, undefined)).toBe(false)
  })
})
