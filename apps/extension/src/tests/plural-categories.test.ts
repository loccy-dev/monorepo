import assert from 'assert'
import { getPluralCategories } from '@repo/shared/core/plurals/plural-categories'

suite('getPluralCategories', () => {
  test('english cardinal returns one, other', () => {
    const categories = getPluralCategories(['en'])
    assert.deepEqual(categories, ['one', 'other'])
  })

  test('english ordinal returns one, two, few, other', () => {
    const categories = getPluralCategories(['en'], 'ordinal')
    assert.deepEqual(categories, ['one', 'two', 'few', 'other'])
  })

  test('arabic cardinal returns all 6 categories', () => {
    const categories = getPluralCategories(['ar'])
    assert.deepEqual(categories, ['zero', 'one', 'two', 'few', 'many', 'other'])
  })

  test('multiple locales merge categories', () => {
    // en: one, other
    // ar: zero, one, two, few, many, other
    const categories = getPluralCategories(['en', 'ar'])
    assert.deepEqual(categories, ['zero', 'one', 'two', 'few', 'many', 'other'])
  })

  test('invalid locale is skipped', () => {
    const categories = getPluralCategories(['invalid-locale-xxx', 'en'])
    assert.deepEqual(categories, ['one', 'other'])
  })

  test('empty locales returns empty array', () => {
    const categories = getPluralCategories([])
    assert.deepEqual(categories, [])
  })
})
