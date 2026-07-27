import { describe, it, expect } from 'vitest'
import type { PluralModel } from '@repo/types/plurals.types'
import { pluralToResourceEntries } from './serialize-plural'
import { icuMessageFormat } from '../message-formats/icu'
import { suffixCldrMessageFormat } from '../message-formats/suffix-cldr'

const model = (branches: PluralModel['branches']): PluralModel => ({
  numberType: 'cardinal',
  countVar: 'count',
  branches,
})

describe('pluralToResourceEntries', () => {
  it('value-locus (icu): one entry at baseKey, serialized per locale', () => {
    const entries = pluralToResourceEntries(
      'items',
      {
        en: model({ one: '# item', other: '# items' }),
        pl: model({ one: '# element', few: '# elementy', many: '# elementów', other: '# elementu' }),
      },
      icuMessageFormat,
    )
    expect(Object.keys(entries)).toEqual(['items'])
    expect(entries['items']!.en).toBe('{count, plural, one {# item} other {# items}}')
    expect(entries['items']!.pl).toBe(
      '{count, plural, one {# element} few {# elementy} many {# elementów} other {# elementu}}',
    )
  })

  it('key-locus (suffix-cldr): fans out to one sibling key per category, unioned across locales', () => {
    const entries = pluralToResourceEntries(
      'items',
      {
        en: model({ one: 'one item', other: '{{count}} items' }),
        ru: model({ one: 'ru-one', few: 'ru-few', many: 'ru-many', other: 'ru-other' }),
      },
      suffixCldrMessageFormat,
    )
    expect(entries).toEqual({
      items_one: { en: 'one item', ru: 'ru-one' },
      items_other: { en: '{{count}} items', ru: 'ru-other' },
      items_few: { ru: 'ru-few' },
      items_many: { ru: 'ru-many' },
    })
  })
})
