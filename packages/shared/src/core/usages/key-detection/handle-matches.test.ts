import { describe, it, expect } from 'vitest'
import { handleMatches } from './handle-matches'
import type { TFuncRegexData } from './types'
import { regexpsReactI18next } from '../../frameworks/react-i18next/detection'
import { regexpsNextIntl } from '../../frameworks/next-intl/detection'
import { regexpsVueI18n } from '../../frameworks/vue-i18n/detection'
import { suffixCldrMessageFormat } from '../../message-formats/suffix-cldr'
import { icuMessageFormat } from '../../message-formats/icu'
import { vuePipeMessageFormat } from '../../message-formats/vue-pipe'
import type { MessageFormat } from '../../contracts'

const scanWith = (content: string, regexData: TFuncRegexData, messageFormat: MessageFormat, allLocales = ['en']) =>
  handleMatches({
    content,
    regexpData: regexData,
    defaultNs: 'translation',
    dynamicKeyResolver: null,
    existing: [],
    checkNested: true,
    messageFormat,
    allLocales,
  })

const scan = (content: string, messageFormat: MessageFormat, allLocales = ['en']) =>
  scanWith(content, regexpsReactI18next.tFunc(['t']), messageFormat, allLocales)

describe('handleMatches — plural expansion is driven by the active message format', () => {
  const src = "t('items', { count })"

  it('suffix-cldr fans a plural usage out into CLDR sibling keys', async () => {
    const [info] = await scan(src, suffixCldrMessageFormat)
    expect(info?.type).toBe('plurals')
    expect(info?.keypaths).toEqual(['items_one', 'items_other'])
  })

  it('icu keeps a single key (plural lives in the value)', async () => {
    const [info] = await scan(src, icuMessageFormat)
    expect(info?.type).toBe('plurals')
    expect(info?.keypaths).toEqual(['items'])
  })

  it('non-plural usages are unaffected by the format', async () => {
    const [info] = await scan("t('title')", suffixCldrMessageFormat)
    expect(info?.type).toBe('static')
    expect(info?.keypaths).toEqual(['title'])
  })
})

describe('next-intl detection', () => {
  const rx = regexpsNextIntl.tFunc(['t'])

  it('resolves a static key (regression: keypath group was mis-read)', async () => {
    const [info] = await scanWith("t('title')", rx, icuMessageFormat)
    expect(info?.type).toBe('static')
    expect(info?.keypaths).toEqual(['title'])
  })

  it('types a `{count}` usage as a plural, single icu key', async () => {
    const [info] = await scanWith("t('items', { count })", rx, icuMessageFormat)
    expect(info?.type).toBe('plurals')
    expect(info?.keypaths).toEqual(['items'])
  })
})

describe('vue-i18n detection', () => {
  const rx = regexpsVueI18n.tFunc(['t', '$tc'])

  it('types a numeric-count usage as a plural (single vue-pipe key)', async () => {
    const [info] = await scanWith("$tc('cart.items', 2)", rx, vuePipeMessageFormat)
    expect(info?.type).toBe('plurals')
    expect(info?.keypaths).toEqual(['cart.items'])
  })

  it('leaves a named-object 2nd arg as a static usage (no false positive)', async () => {
    const [info] = await scanWith("t('greeting', { name })", rx, vuePipeMessageFormat)
    expect(info?.type).toBe('static')
    expect(info?.keypaths).toEqual(['greeting'])
  })
})
