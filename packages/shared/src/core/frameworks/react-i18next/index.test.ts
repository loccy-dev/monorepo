import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { reactI18nextFramework } from './index'
import { icuMessageFormat } from '../../message-formats/icu'
import { getFramework, resolveMessageFormatId } from '../../registry'

const ctx = (overrides: Partial<FrameworkScanContext> = {}): FrameworkScanContext => ({
  defaultNs: 'translation',
  customFunctionNames: [],
  dynamicKeyResolver: null,
  messageFormat: icuMessageFormat,
  allLocales: ['en'],
  existingKeypaths: [],
  ...overrides,
})

const scan = (content: string, c = ctx()) => reactI18nextFramework.scanContent(content, c)
const keypathsOf = async (content: string, c = ctx()) => (await scan(content, c)).flatMap((info) => info.keypaths)

describe('react-i18next — useTranslation hook', () => {
  it('detects a plain `const { t } = useTranslation()` call', async () => {
    const content = "const { t } = useTranslation();\nt('greeting.hello')"
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })

  it('resolves a renamed destructure (`const { t: translate } = useTranslation()`)', async () => {
    const content = "const { t: translate } = useTranslation();\ntranslate('greeting.hello')"
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })

  it('does not pick up the un-renamed `t` once the hook destructures it under another name', async () => {
    const content = "const { t: translate } = useTranslation();\nt('greeting.hello')"
    // `t` is still scanned generically (it's always a candidate name), so it still matches —
    // only the ns/prefix tied to the `useTranslation()` call is lost for it.
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })

  it("carries the hook's namespace argument onto matched usages", async () => {
    const content = "const { t } = useTranslation('common');\nt('greeting.hello')"
    const [info] = await scan(content)
    expect(info?.ns).toBe('common')
  })

  it("resolves `keyPrefix` onto the matched call's keypath and records it as `info.prefix`", async () => {
    const content = "const { t } = useTranslation('common', { keyPrefix: 'greeting' });\nt('hello')"
    const [info] = await scan(content)
    expect(info?.keypaths).toEqual(['greeting.hello'])
    expect(info?.prefix).toBe('greeting')
  })
})

describe('react-i18next — withTranslation HOC', () => {
  it('detects `this.props.t` usages inside a withTranslation-wrapped class', async () => {
    const content = "withTranslation('common')(MyComponent);\nthis.props.t('greeting.hello')"
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })
})

describe('react-i18next — i18n.t fallback', () => {
  it('detects `i18n.t(...)` when no hook/HOC is present', async () => {
    expect(await keypathsOf("i18n.t('greeting.hello')")).toEqual(['greeting.hello'])
  })
})

describe('react-i18next — custom function names', () => {
  it('honors project-configured custom function names alongside `t`', async () => {
    expect(await keypathsOf('translate("greeting.hi")', ctx({ customFunctionNames: ['translate'] }))).toEqual([
      'greeting.hi',
    ])
  })
})

describe('react-i18next — <Trans> component', () => {
  it('detects a static `i18nKey` attribute', async () => {
    expect(await keypathsOf('<Trans i18nKey="greeting.hello">Hello</Trans>')).toEqual(['greeting.hello'])
  })

  it('carries the `ns` attribute onto the usage', async () => {
    const [info] = await scan('<Trans i18nKey="greeting.hello" ns="common">Hello</Trans>')
    expect(info?.ns).toBe('common')
  })
})

describe('react-i18next — registration and message format', () => {
  it('is registered under its id', () => {
    expect(getFramework('react-i18next')).toBe(reactI18nextFramework)
  })

  it('detects from the react-i18next dependency', () => {
    expect(reactI18nextFramework.detectFromDeps(new Set(['react-i18next']))).toBe(true)
    expect(reactI18nextFramework.detectFromDeps(new Set())).toBe(false)
  })

  it('defaults to suffix-cldr; switches to icu when i18next-icu is installed', () => {
    expect(resolveMessageFormatId(reactI18nextFramework, new Set(['react-i18next']))).toBe('suffix-cldr')
    expect(resolveMessageFormatId(reactI18nextFramework, new Set(['react-i18next', 'i18next-icu']))).toBe('icu')
  })
})

describe('react-i18next — ideInsert', () => {
  it('adds an `ns` option piece when the t-function carries a namespace', () => {
    const text = reactI18nextFramework.ideInsert!.insertTFunctionText({
      tFunctionInfo: { tName: 't', ns: 'common' },
      keypath: 'greeting.hello',
      quoteType: 'single',
    })
    expect(text).toBe("t('greeting.hello', { ns: 'common' })")
  })

  it('round-trips a `$t(ns:key)` linked-message reference', () => {
    const utils = reactI18nextFramework.ideInsert!.linkedMessageUtils!
    expect(utils.build('greeting.hello', 'common')).toBe('$t(common:greeting.hello)')
    expect(utils.parse('common:greeting.hello')).toEqual({ keypath: 'greeting.hello', ns: 'common' })
  })
})
