import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { nextIntlFramework } from './index'
import { icuMessageFormat } from '../../message-formats/icu'
import { getFramework, resolveMessageFormatId } from '../../registry'
import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'

const ctx = (overrides: Partial<FrameworkScanContext> = {}): FrameworkScanContext => ({
  defaultNs: NS_WITHOUT_NS,
  customFunctionNames: [],
  dynamicKeyResolver: null,
  messageFormat: icuMessageFormat,
  allLocales: ['en'],
  existingKeypaths: [],
  ...overrides,
})

const scan = (content: string, c = ctx()) => nextIntlFramework.scanContent(content, c)
const keypathsOf = async (content: string, c = ctx()) => (await scan(content, c)).flatMap((info) => info.keypaths)

describe('next-intl — useTranslations/getTranslations hooks', () => {
  it('detects a plain `const t = useTranslations()` call', async () => {
    const content = "const t = useTranslations();\nt('greeting.hello')"
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })

  it('resolves the string argument as a key prefix, not an i18next-style namespace', async () => {
    const content = "const t = useTranslations('greeting');\nt('hello')"
    const [info] = await scan(content)
    expect(info?.keypaths).toEqual(['greeting.hello'])
    expect(info?.prefix).toBe('greeting')
  })

  it('detects the server-side `await getTranslations(...)` form', async () => {
    const content = "const t = await getTranslations('greeting');\nt('hello')"
    expect(await keypathsOf(content)).toEqual(['greeting.hello'])
  })

  it('falls back to plain `t(...)` when no hook call is present', async () => {
    expect(await keypathsOf("t('greeting.hello')")).toEqual(['greeting.hello'])
  })

  it('honors project-configured custom function names', async () => {
    expect(await keypathsOf('translate("greeting.hi")', ctx({ customFunctionNames: ['translate'] }))).toEqual([
      'greeting.hi',
    ])
  })
})

describe('next-intl — plural detection via `{ count }`', () => {
  it('flags a usage with a `count` option as a plural', async () => {
    const [info] = await scan("t('items', { count })")
    expect(info?.type).toBe('plurals')
  })
})

describe('next-intl — registration and message format', () => {
  it('is registered under its id', () => {
    expect(getFramework('next-intl')).toBe(nextIntlFramework)
  })

  it('detects from the next-intl dependency', () => {
    expect(nextIntlFramework.detectFromDeps(new Set(['next-intl']))).toBe(true)
    expect(nextIntlFramework.detectFromDeps(new Set())).toBe(false)
  })

  it('resolves to icu (its only hosted format)', () => {
    expect(resolveMessageFormatId(nextIntlFramework, new Set())).toBe('icu')
  })
})

describe('next-intl — ideInsert', () => {
  it('inserts a call wrapped in `{}` for JSX interpolation, with no linked-message support', () => {
    const text = nextIntlFramework.ideInsert!.insertTFunctionText({
      tFunctionInfo: { tName: 't' },
      keypath: 'greeting.hello',
      quoteType: 'single',
      wrapInterpolation: '{}',
    })
    expect(text).toBe("{t('greeting.hello')}")
    expect(nextIntlFramework.ideInsert!.linkedMessageUtils).toBeUndefined()
  })
})
