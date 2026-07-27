import { describe, it, expect } from 'vitest'
import type { PluralModel } from '@repo/types/plurals.types'
import { suffixCldrMessageFormat } from './suffix-cldr'
import { icuMessageFormat } from './icu'
import { vuePipeMessageFormat } from './vue-pipe'
import { choicePipeMessageFormat } from './choice-pipe'
import { getFramework, getMessageFormat, resolveActiveMessageFormat, resolveMessageFormatId } from '../registry'
import { makeModule } from '../loccy-config/test-fixtures'

const ctx = (locales: string[], numberType: 'cardinal' | 'ordinal' = 'cardinal', existingKeypaths: string[] = []) => ({
  numberType,
  locales,
  existingKeypaths,
})

describe('suffix-cldr (key-locus)', () => {
  const fmt = suffixCldrMessageFormat

  it('fans a usage out into CLDR sibling keys', () => {
    expect(fmt.expandPluralKeypaths('items', ctx(['en']))).toEqual(['items_one', 'items_other'])
    expect(fmt.expandPluralKeypaths('items', ctx(['ar']))).toEqual([
      'items_zero',
      'items_one',
      'items_two',
      'items_few',
      'items_many',
      'items_other',
    ])
  })

  it('unions categories across locales', () => {
    expect(fmt.expandPluralKeypaths('x', ctx(['en', 'ru']))).toEqual(['x_one', 'x_few', 'x_many', 'x_other'])
  })

  it('uses ordinal suffixes for ordinal usages', () => {
    expect(fmt.expandPluralKeypaths('place', ctx(['en'], 'ordinal'))).toEqual([
      'place_ordinal_one',
      'place_ordinal_two',
      'place_ordinal_few',
      'place_ordinal_other',
    ])
  })

  it('adds _zero (i18next rule) only when such a key already exists', () => {
    expect(fmt.expandPluralKeypaths('items', ctx(['en'], 'cardinal', ['items_zero']))).toEqual([
      'items_zero',
      'items_one',
      'items_other',
    ])
    expect(fmt.expandPluralKeypaths('items', ctx(['en']))).not.toContain('items_zero')
  })

  it('has no value codec — its plural lives across keys', () => {
    expect(fmt.valueCodec).toBeUndefined()
  })

  it('pluralKeyFor builds a sibling key; parsePluralKey is its inverse', () => {
    expect(fmt.pluralKeyFor!('items', 'few', 'cardinal')).toBe('items_few')
    expect(fmt.pluralKeyFor!('place', 'one', 'ordinal')).toBe('place_ordinal_one')
    expect(fmt.parsePluralKey!('items_few')).toEqual({ baseKey: 'items', category: 'few', numberType: 'cardinal' })
    expect(fmt.parsePluralKey!('place_ordinal_one')).toEqual({
      baseKey: 'place',
      category: 'one',
      numberType: 'ordinal',
    })
    expect(fmt.parsePluralKey!('plainKey')).toBeNull()
  })
})

describe('icu (value-locus)', () => {
  const codec = icuMessageFormat.valueCodec!

  it('keeps a single key', () => {
    expect(icuMessageFormat.expandPluralKeypaths('items', ctx(['en']))).toEqual(['items'])
  })

  it('parses a plural argument', () => {
    expect(codec.parseValue('{count, plural, one {# item} other {# items}}', 'en')).toEqual({
      numberType: 'cardinal',
      countVar: 'count',
      branches: { one: '# item', other: '# items' },
    })
  })

  it('parses selectordinal as ordinal and exact matches', () => {
    const model = codec.parseValue('{n, selectordinal, =0 {none} one {#st} two {#nd} other {#th}}', 'en')
    expect(model?.numberType).toBe('ordinal')
    expect(model?.countVar).toBe('n')
    expect(model?.branches).toEqual({ '=0': 'none', one: '#st', two: '#nd', other: '#th' })
  })

  it('handles nested braces inside a branch', () => {
    const model = codec.parseValue('{count, plural, one {{name} has 1} other {{name} has #}}', 'en')
    expect(model?.branches).toEqual({ one: '{name} has 1', other: '{name} has #' })
  })

  it('round-trips through serialize (other always last, exacts first)', () => {
    const value = '{count, plural, =0 {none} one {# item} other {# items}}'
    const model = codec.parseValue(value, 'en')!
    expect(codec.serializeValue(model, 'en')).toBe(value)
  })

  it('is not a plural when the value is plain text or has surrounding text', () => {
    expect(codec.parseValue('just text', 'en')).toBeNull()
    expect(codec.parseValue('Total: {count, plural, one {#} other {#}}', 'en')).toBeNull()
  })

  it('requires `other` for every locale', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'count', branches: { one: 'x' } }
    expect(codec.validate(model, 'en', 'cardinal')).toContainEqual({ kind: 'missing-other' })
  })

  it('flags a missing CLDR category', () => {
    const model: PluralModel = { numberType: 'cardinal', countVar: 'n', branches: { one: 'x', other: 'y' } }
    // Russian needs one/few/many/other — `few`/`many` missing
    const issues = codec.validate(model, 'ru', 'cardinal')
    expect(issues).toContainEqual({ kind: 'missing-category', category: 'few' })
    expect(issues).toContainEqual({ kind: 'missing-category', category: 'many' })
  })
})

describe('vue-pipe (value-locus, positional)', () => {
  const codec = vuePipeMessageFormat.valueCodec!

  it('maps 2 segments to one/other', () => {
    expect(codec.parseValue('one apple | {count} apples', 'en')).toEqual({
      numberType: 'cardinal',
      countVar: 'count',
      branches: { one: 'one apple', other: '{count} apples' },
    })
  })

  it('maps 3 segments to =0/one/other', () => {
    expect(codec.parseValue('no apples | one apple | {count} apples', 'en')?.branches).toEqual({
      '=0': 'no apples',
      one: 'one apple',
      other: '{count} apples',
    })
  })

  it('is not a plural without a pipe', () => {
    expect(codec.parseValue('one apple', 'en')).toBeNull()
  })

  it('round-trips 3-segment values', () => {
    const value = 'no apples | one apple | {count} apples'
    expect(codec.serializeValue(codec.parseValue(value, 'en')!, 'en')).toBe(value)
  })

  it('keeps ALL of a locale’s forms — Russian is one/few/many/other, not collapsed to 2', () => {
    const model: PluralModel = {
      numberType: 'cardinal',
      countVar: 'count',
      branches: { one: '{count} нажатие', few: '{count} нажатия', many: '{count} нажатий', other: '{count} нажатия' },
    }
    expect(codec.serializeValue(model, 'ru')).toBe(
      '{count} нажатие | {count} нажатия | {count} нажатий | {count} нажатия',
    )
    // and parsing it back under `ru` restores the four categories
    expect(codec.parseValue(codec.serializeValue(model, 'ru'), 'ru')?.branches).toEqual(model.branches)
  })
})

describe('choice-pipe (Laravel/Symfony trans_choice)', () => {
  const codec = choicePipeMessageFormat.valueCodec!

  it('maps positional segments like vue', () => {
    expect(codec.parseValue('apple|apples', 'en')?.branches).toEqual({ one: 'apple', other: 'apples' })
    expect(codec.parseValue('none|one|many', 'en')?.branches).toEqual({ '=0': 'none', one: 'one', other: 'many' })
  })

  it('parses explicit {n} exact selectors', () => {
    expect(codec.parseValue('{0} none|{1} one apple|[2,*] :count apples', 'en')?.branches).toEqual({
      '=0': 'none',
      '=1': 'one apple',
      other: ':count apples', // open interval → catch-all
    })
  })

  it('maps a single-value interval [n,n] to an exact', () => {
    expect(codec.parseValue('[0,0] none|[1,*] some', 'en')?.branches).toEqual({ '=0': 'none', other: 'some' })
  })

  it('round-trips positional and exact forms', () => {
    expect(codec.serializeValue(codec.parseValue('apple|apples', 'en')!, 'en')).toBe('apple|apples')
    expect(
      codec.serializeValue({ numberType: 'cardinal', countVar: 'count', branches: { '=0': 'no', '=1': 'one' } }, 'en'),
    ).toBe('{0} no|{1} one')
  })

  it('is not a plural without a pipe', () => {
    expect(codec.parseValue('just one apple', 'en')).toBeNull()
  })
})

describe('message-format resolution (detection replaces composition)', () => {
  it('i18next resolves to icu only when i18next-icu is installed', () => {
    const react = getFramework('react-i18next')!
    expect(resolveMessageFormatId(react, new Set(['react-i18next']))).toBe('suffix-cldr')
    expect(resolveMessageFormatId(react, new Set(['react-i18next', 'i18next-icu']))).toBe('icu')
  })

  it('single-format frameworks resolve to their one format', () => {
    expect(resolveMessageFormatId(getFramework('next-intl')!, new Set())).toBe('icu')
    expect(resolveMessageFormatId(getFramework('vue-i18n')!, new Set())).toBe('vue-pipe')
    expect(resolveMessageFormatId(getFramework('laravel')!, new Set())).toBe('choice-pipe')
  })

  it("resolveActiveMessageFormat returns the module's resolved message format", () => {
    expect(resolveActiveMessageFormat(makeModule({ translations: { messageFormat: 'suffix-cldr' } })).id).toBe(
      'suffix-cldr',
    )
    expect(resolveActiveMessageFormat(makeModule({ translations: { messageFormat: 'icu' } })).id).toBe('icu')
  })

  it('every message format is registered', () => {
    for (const id of ['suffix-cldr', 'icu', 'vue-pipe', 'choice-pipe']) {
      expect(getMessageFormat(id)?.id).toBe(id)
    }
  })
})
