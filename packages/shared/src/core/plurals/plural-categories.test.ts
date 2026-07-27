import { describe, it, expect } from 'vitest'
import { getPluralCategories, PLURAL_CATEGORIES } from './plural-categories'

describe('getPluralCategories', () => {
  it('resolves cardinal categories per locale', () => {
    expect(getPluralCategories(['en'])).toEqual(['one', 'other'])
    expect(getPluralCategories(['ja'])).toEqual(['other'])
    expect(getPluralCategories(['ru'])).toEqual(['one', 'few', 'many', 'other'])
    expect(getPluralCategories(['ar'])).toEqual(['zero', 'one', 'two', 'few', 'many', 'other'])
  })

  it('resolves ordinal categories', () => {
    expect(getPluralCategories(['en'], 'ordinal')).toEqual(['one', 'two', 'few', 'other'])
  })

  it('unions across locales in canonical order', () => {
    expect(getPluralCategories(['en', 'ru'])).toEqual(['one', 'few', 'many', 'other'])
  })

  it('skips invalid locales', () => {
    expect(getPluralCategories(['not-a-locale', 'en'])).toEqual(['one', 'other'])
  })

  it('canonical order is fixed', () => {
    expect(PLURAL_CATEGORIES).toEqual(['zero', 'one', 'two', 'few', 'many', 'other'])
  })
})
