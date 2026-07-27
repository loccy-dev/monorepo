import { describe, it, expect } from 'vitest'
import type { PluralModel } from '@repo/types/plurals.types'
import { missingValuePluralCategories, requiredPluralCategories } from './validate-plural'
import { icuMessageFormat } from '../message-formats/icu'
import { suffixCldrMessageFormat } from '../message-formats/suffix-cldr'

describe('requiredPluralCategories', () => {
  it('CLDR formats (icu) delegate to Intl per locale', () => {
    expect(requiredPluralCategories('en', icuMessageFormat, 'cardinal')).toEqual(['one', 'other'])
    expect(requiredPluralCategories('ru', icuMessageFormat, 'cardinal')).toEqual(['one', 'few', 'many', 'other'])
  })

  it('key-locus (no codec) falls back to CLDR', () => {
    expect(requiredPluralCategories('ru', suffixCldrMessageFormat, 'cardinal')).toEqual(['one', 'few', 'many', 'other'])
    expect(requiredPluralCategories('ja', suffixCldrMessageFormat, 'cardinal')).toEqual(['other'])
  })
})

describe('missingValuePluralCategories', () => {
  it('flags the categories a locale still owes', () => {
    const value = '{count, plural, one {x} other {y}}' // ru needs few/many too
    expect(missingValuePluralCategories(value, 'ru', icuMessageFormat, 'cardinal').sort()).toEqual(['few', 'many'])
  })

  it('is empty for a complete value', () => {
    const value = '{count, plural, one {x} other {y}}'
    expect(missingValuePluralCategories(value, 'en', icuMessageFormat, 'cardinal')).toEqual([])
  })

  it('is empty for key-locus formats (no value codec)', () => {
    expect(missingValuePluralCategories('anything', 'ru', suffixCldrMessageFormat, 'cardinal')).toEqual([])
  })

  it('is empty when the value is not a plural', () => {
    expect(missingValuePluralCategories('plain text', 'ru', icuMessageFormat, 'cardinal')).toEqual([])
  })
})
