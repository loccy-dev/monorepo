import { describe, it, expect } from 'vitest'
import type { InsertTFunctionTextParams } from '../contracts'
import { buildTFunctionCallText } from './common-insert'

const base = (over: Partial<InsertTFunctionTextParams> = {}): InsertTFunctionTextParams => ({
  tFunctionInfo: { tName: 't' },
  keypath: 'greeting.hello',
  quoteType: 'single',
  ...over,
})

describe('buildTFunctionCallText', () => {
  it('builds a plain call with the requested quote style', () => {
    expect(buildTFunctionCallText(base({ quoteType: 'single' }))).toBe("t('greeting.hello')")
    expect(buildTFunctionCallText(base({ quoteType: 'double' }))).toBe('t("greeting.hello")')
  })

  it('strips the tFunctionInfo prefix when the keypath starts with it', () => {
    const params = base({ tFunctionInfo: { tName: 't', prefix: 'greeting' }, keypath: 'greeting.hello' })
    expect(buildTFunctionCallText(params)).toBe("t('hello')")
  })

  it('leaves the keypath untouched when it does not start with the prefix', () => {
    const params = base({ tFunctionInfo: { tName: 't', prefix: 'other' }, keypath: 'greeting.hello' })
    expect(buildTFunctionCallText(params)).toBe("t('greeting.hello')")
  })

  it('appends params as an options object', () => {
    const params = base({ params: { count: 'n' } })
    expect(buildTFunctionCallText(params)).toBe("t('greeting.hello', { count: n })")
  })

  it('shorthands a param whose key equals its value', () => {
    const params = base({ params: { count: 'count' } })
    expect(buildTFunctionCallText(params)).toBe("t('greeting.hello', { count })")
  })

  it('quotes an empty param value as an empty string', () => {
    const params = base({ params: { name: '' } })
    expect(buildTFunctionCallText(params)).toBe("t('greeting.hello', { name: '' })")
  })

  it('prepends extraPieces before params', () => {
    const params = base({ params: { count: 'n' } })
    expect(buildTFunctionCallText(params, (_info, qt) => [`ns: ${qt}common${qt}`])).toBe(
      "t('greeting.hello', { ns: 'common', count: n })",
    )
  })

  it('wraps per the caller-detected wrapInterpolation kind', () => {
    expect(buildTFunctionCallText(base({ wrapInterpolation: '{}' }))).toBe("{t('greeting.hello')}")
    expect(buildTFunctionCallText(base({ wrapInterpolation: '{{}}' }))).toBe("{{ t('greeting.hello') }}")
  })

  it('does not wrap when wrapInterpolation is absent', () => {
    expect(buildTFunctionCallText(base())).toBe("t('greeting.hello')")
  })

  it('folds a plural count into the options object (i18next-style)', () => {
    expect(buildTFunctionCallText(base({ count: { var: 'count', expr: 'items.length' } }))).toBe(
      "t('greeting.hello', { count: items.length })",
    )
    // shorthand when the runtime expr equals the var (or is absent)
    expect(buildTFunctionCallText(base({ count: { var: 'count' } }))).toBe("t('greeting.hello', { count })")
  })

  it('places the count positionally when requested (vue-i18n)', () => {
    expect(
      buildTFunctionCallText(base({ count: { var: 'count', expr: 'items.length' } }), undefined, {
        positionalCount: true,
      }),
    ).toBe("t('greeting.hello', items.length)")
  })
})
