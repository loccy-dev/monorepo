import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { vueI18nFramework } from './index'
import { icuMessageFormat } from '../../message-formats/icu'
import { getFramework, resolveMessageFormatId } from '../../registry'

const ctx = (overrides: Partial<FrameworkScanContext> = {}): FrameworkScanContext => ({
  defaultNs: 'messages',
  customFunctionNames: [],
  dynamicKeyResolver: null,
  messageFormat: icuMessageFormat,
  allLocales: ['en'],
  existingKeypaths: [],
  ...overrides,
})

const scan = (content: string, c = ctx()) => vueI18nFramework.scanContent(content, c)
const keypathsOf = async (content: string, c = ctx()) => (await scan(content, c)).flatMap((info) => info.keypaths)

describe('vue-i18n — t-function detection', () => {
  it('detects `t("key")` and `$t("key")`', async () => {
    expect(await keypathsOf('t("greeting.hello")')).toEqual(['greeting.hello'])
    expect(await keypathsOf('$t("greeting.hello")')).toEqual(['greeting.hello'])
  })

  it('detects `this.$t`/`this.t` and the global composer `i18n.global.t`', async () => {
    expect(await keypathsOf('this.$t("a")')).toEqual(['a'])
    expect(await keypathsOf('i18n.global.t("b")')).toEqual(['b'])
  })

  it('flags a plural usage from a numeric literal 2nd arg (unambiguous count)', async () => {
    const [info] = await scan('t("items", 5)')
    expect(info?.type).toBe('plurals')
  })

  it('does not treat a variable 2nd arg as a plural count (ambiguous with named/list args)', async () => {
    const [info] = await scan('t("items", n)')
    expect(info?.type).toBe('static')
  })

  it('honors project-configured custom function names', async () => {
    expect(await keypathsOf('tr("greeting.hi")', ctx({ customFunctionNames: ['tr'] }))).toEqual(['greeting.hi'])
  })
})

describe('vue-i18n — <i18n-t> component detection', () => {
  it('detects a static `keypath` attribute', async () => {
    expect(await keypathsOf('<i18n-t keypath="greeting.hello" tag="span" />')).toEqual(['greeting.hello'])
  })

  it('detects a bound `:keypath` attribute', async () => {
    expect(await keypathsOf('<i18n-t :keypath="\'greeting.hello\'" tag="span" />')).toEqual(['greeting.hello'])
  })
})

describe('vue-i18n — registration and message format', () => {
  it('is registered under its id', () => {
    expect(getFramework('vue-i18n')).toBe(vueI18nFramework)
  })

  it('detects from vue-i18n or @nuxtjs/i18n deps', () => {
    expect(vueI18nFramework.detectFromDeps(new Set(['vue-i18n']))).toBe(true)
    expect(vueI18nFramework.detectFromDeps(new Set(['@nuxtjs/i18n']))).toBe(true)
    expect(vueI18nFramework.detectFromDeps(new Set())).toBe(false)
  })

  it('resolves to vue-pipe by default', () => {
    expect(resolveMessageFormatId(vueI18nFramework, new Set())).toBe('vue-pipe')
  })
})

describe('vue-i18n — ideInsert', () => {
  it('inserts a call wrapped in `{{ }}` for Vue template interpolation', () => {
    const text = vueI18nFramework.ideInsert!.insertTFunctionText({
      tFunctionInfo: { tName: 't' },
      keypath: 'greeting.hello',
      quoteType: 'single',
      wrapInterpolation: '{{}}',
    })
    expect(text).toBe("{{ t('greeting.hello') }}")
  })

  it('round-trips a linked-message reference through build/parse', () => {
    const utils = vueI18nFramework.ideInsert!.linkedMessageUtils!
    expect(utils.build('greeting.hello')).toBe('@:greeting.hello')
    expect(utils.parse('@:greeting.hello'.slice(2))).toEqual({ keypath: 'greeting.hello' })
  })
})
