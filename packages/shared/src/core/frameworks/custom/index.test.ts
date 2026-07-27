import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { customFramework } from './index'
import { icuMessageFormat } from '../../message-formats/icu'
import { getFramework, getFrameworkOrCustom, resolveMessageFormatId } from '../../registry'

const ctx = (overrides: Partial<FrameworkScanContext> = {}): FrameworkScanContext => ({
  defaultNs: 'messages',
  customFunctionNames: [],
  dynamicKeyResolver: null,
  messageFormat: icuMessageFormat,
  allLocales: ['en'],
  existingKeypaths: [],
  ...overrides,
})

const keypathsOf = async (content: string, c = ctx()) =>
  (await customFramework.scanContent(content, c)).flatMap((info) => info.keypaths)

describe('custom — fallback framework', () => {
  it('detects the bare `t("key")` call, with no built-in namespace/component conventions', async () => {
    expect(await keypathsOf('t("greeting.hello")')).toEqual(['greeting.hello'])
  })

  it('honors project-configured custom function names alongside `t`', async () => {
    expect(await keypathsOf('translate("greeting.hi")', ctx({ customFunctionNames: ['translate'] }))).toEqual([
      'greeting.hi',
    ])
  })

  it('is never auto-detected from deps', () => {
    expect(customFramework.detectFromDeps(new Set(['react-i18next', 'vue-i18n']))).toBe(false)
  })

  it('is the fallback for an unregistered framework id', () => {
    expect(getFrameworkOrCustom('unknown-framework')).toBe(customFramework)
  })

  it('is registered under its id', () => {
    expect(getFramework('custom')).toBe(customFramework)
  })

  it('defaults to icu (value-locus, no accidental key fan-out)', () => {
    expect(resolveMessageFormatId(customFramework, new Set())).toBe('icu')
  })
})
