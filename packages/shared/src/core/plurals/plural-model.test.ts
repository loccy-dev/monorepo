import { describe, it, expect } from 'vitest'
import type { PluralModel } from '@repo/types/plurals.types'
import { orderedBranchKeys, validateBranches, positionalBranches, cldrValueCodecDefaults } from './plural-model'

describe('orderedBranchKeys', () => {
  it('emits canonical CLDR order regardless of insertion order, other always last', () => {
    expect(orderedBranchKeys({ many: 'm', other: 'o', few: 'f', one: '1' })).toEqual(['one', 'few', 'many', 'other'])
  })

  it('sorts exact keys numerically, before categories', () => {
    expect(orderedBranchKeys({ '=10': 'ten', one: '1', '=2': 'two' })).toEqual(['=2', '=10', 'one'])
  })

  it('omits categories not present in branches', () => {
    expect(orderedBranchKeys({ other: 'o' })).toEqual(['other'])
  })
})

describe('validateBranches', () => {
  it('flags each missing required category', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: { one: 'x' } }
    expect(validateBranches(model, ['one', 'few', 'other'], { requireOther: false })).toEqual([
      { kind: 'missing-category', category: 'few' },
      { kind: 'missing-other' },
    ])
  })

  it('requireOther adds missing-other even when other is not in required', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: { one: 'x' } }
    expect(validateBranches(model, ['one'], { requireOther: true })).toEqual([{ kind: 'missing-other' }])
  })

  it('requireOther does not duplicate when other is already required', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: {} }
    expect(validateBranches(model, ['other'], { requireOther: true })).toEqual([{ kind: 'missing-other' }])
  })

  it('no issues when every requirement is met', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: { one: 'x', other: 'y' } }
    expect(validateBranches(model, ['one', 'other'], { requireOther: true })).toEqual([])
  })
})

describe('positionalBranches', () => {
  it('maps segments to the LOCALE’s CLDR categories in order (English → one/other)', () => {
    expect(positionalBranches(['a', 'b'], 'en')).toEqual({ one: 'a', other: 'b' })
  })

  it('maps Russian’s four segments to one/few/many/other (not just one/other)', () => {
    expect(positionalBranches(['a', 'b', 'c', 'd'], 'ru')).toEqual({ one: 'a', few: 'b', many: 'c', other: 'd' })
  })

  it('treats one extra leading segment as the `=0` (count-zero) idiom', () => {
    expect(positionalBranches(['a', 'b', 'c'], 'en')).toEqual({ '=0': 'a', one: 'b', other: 'c' })
    expect(positionalBranches(['z', 'a', 'b', 'c', 'd'], 'ru')).toEqual({
      '=0': 'z',
      one: 'a',
      few: 'b',
      many: 'c',
      other: 'd',
    })
  })

  it('maps positionally to the locale’s categories, ignoring extra segments', () => {
    // English has only one/other — a stray 4th+ segment has no category and is dropped.
    expect(positionalBranches(['a', 'b', 'c', 'd', 'e'], 'en')).toEqual({ one: 'a', other: 'b' })
  })
})

describe('cldrValueCodecDefaults', () => {
  it('requiredCategories delegates to CLDR resolution for the locale', () => {
    expect(cldrValueCodecDefaults.requiredCategories('ru', 'cardinal')).toEqual(['one', 'few', 'many', 'other'])
  })

  it('validate always demands other, even for locales whose CLDR set already includes it', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: { one: 'x' } }
    expect(cldrValueCodecDefaults.validate(model, 'en', 'cardinal')).toEqual([{ kind: 'missing-other' }])
  })
})
