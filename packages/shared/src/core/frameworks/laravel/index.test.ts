import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { laravelFramework } from './index'
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

const keypathsOf = async (content: string, c = ctx()) =>
  (await laravelFramework.scanContent(content, c)).flatMap((info) => info.keypaths)

describe('laravel — translation-function detection', () => {
  it('detects `__("key")`, `trans("key")`, and `trans_choice("key", $n)`', async () => {
    expect(await keypathsOf('__("auth.failed")')).toEqual(['auth.failed'])
    expect(await keypathsOf('trans("messages.welcome")')).toEqual(['messages.welcome'])
    expect(await keypathsOf('trans_choice("messages.apples", $count)')).toEqual(['messages.apples'])
  })

  it('detects the Blade `@lang` directive convention', async () => {
    expect(await keypathsOf('@lang("messages.hi")')).toEqual(['messages.hi'])
  })

  it('honors project-configured custom function names', async () => {
    expect(await keypathsOf('tr("Custom")', ctx({ customFunctionNames: ['tr'] }))).toEqual(['Custom'])
  })
})

describe('laravel — registration and message format', () => {
  it('is registered under its id', () => {
    expect(getFramework('laravel')).toBe(laravelFramework)
  })

  it('detects from the laravel/framework dependency', () => {
    expect(laravelFramework.detectFromDeps(new Set(['laravel/framework']))).toBe(true)
    expect(laravelFramework.detectFromDeps(new Set())).toBe(false)
  })

  it('resolves to choice-pipe (its only hosted format)', () => {
    expect(resolveMessageFormatId(laravelFramework, new Set())).toBe('choice-pipe')
  })
})

describe('laravel — plural insert', () => {
  const insert = laravelFramework.ideInsert!
  const params = (over = {}) => ({
    tFunctionInfo: { tName: '__' },
    keypath: 'messages.apples',
    quoteType: 'single' as const,
    ...over,
  })

  it('non-plural uses the detected t-function', () => {
    expect(insert.insertTFunctionText(params())).toBe("__('messages.apples')")
  })

  it('plural switches to trans_choice with a positional count (PHP `$count` default)', () => {
    expect(insert.insertTFunctionText(params({ count: { var: '$count' } }))).toBe(
      "trans_choice('messages.apples', $count)",
    )
    expect(insert.insertTFunctionText(params({ count: { var: '$count', expr: '$items->count()' } }))).toBe(
      "trans_choice('messages.apples', $items->count())",
    )
  })

  it('exposes `$count` as its plural var', () => {
    expect(insert.pluralVar).toBe('$count')
  })
})
