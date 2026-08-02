import { describe, expect, it } from 'vitest'
import type { KeypathInfo } from '@repo/types/framework.types'
import { rewriteUsagesInSource } from './rename-usage'

/** A usage of `literal` inside `content`, as the scanner reports it. */
function usage(content: string, literal: string, extra: Partial<KeypathInfo> = {}): KeypathInfo {
  const start = content.indexOf(literal)
  return {
    loc: { start, end: start + literal.length, line: 0 },
    content: literal,
    ns: '_',
    keypaths: [literal.slice(1, -1)],
    type: 'static',
    ...extra,
  }
}

describe('rewriteUsagesInSource', () => {
  it('replaces the key inside the quotes', () => {
    const content = "t('login.title')"
    expect(
      rewriteUsagesInSource(content, [{ usages: [usage(content, "'login.title'")], newKeypath: 'login.heading' }]),
    ).toBe("t('login.heading')")
  })

  it('keeps the namespace the literal spelled', () => {
    const content = "t('auth:login.title')"
    const info = usage(content, "'auth:login.title'", { ns: 'auth', nsInKeypath: true, keypaths: ['login.title'] })
    expect(rewriteUsagesInSource(content, [{ usages: [info], newKeypath: 'login.heading' }])).toBe(
      "t('auth:login.heading')",
    )
  })

  it('leaves the key bare where the namespace came from the t-function', () => {
    const content = "t('login.title')"
    const info = usage(content, "'login.title'", { ns: 'auth' })
    expect(rewriteUsagesInSource(content, [{ usages: [info], newKeypath: 'login.heading' }])).toBe("t('login.heading')")
  })

  it('strips a scoped t-function prefix, namespace intact', () => {
    const content = "t('title')"
    const info = usage(content, "'title'", {
      ns: 'auth',
      nsInKeypath: true,
      prefix: 'login',
      keypaths: ['login.title'],
    })
    expect(rewriteUsagesInSource(content, [{ usages: [info], newKeypath: 'login.heading' }])).toBe("t('auth:heading')")
  })

  it('applies several edits in one file without shifting offsets', () => {
    const content = "t('a.b') + t('a.b')"
    const first = usage(content, "'a.b'")
    const second: KeypathInfo = { ...first, loc: { start: 13, end: 18, line: 0 } }
    expect(rewriteUsagesInSource(content, [{ usages: [first, second], newKeypath: 'c.d' }])).toBe("t('c.d') + t('c.d')")
  })

  it('renames two different keys in one file without shifting offsets', () => {
    const content = "t('a.b') + t('x.y')"
    const first = usage(content, "'a.b'")
    const second = usage(content, "'x.y'")
    expect(
      rewriteUsagesInSource(content, [
        { usages: [first], newKeypath: 'a.renamed' },
        { usages: [second], newKeypath: 'x.renamed' },
      ]),
    ).toBe("t('a.renamed') + t('x.renamed')")
  })
})
