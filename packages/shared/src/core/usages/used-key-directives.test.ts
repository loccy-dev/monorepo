import { describe, expect, it } from 'vitest'
import { collectUsedKeyDirectives } from './used-key-directives'

describe('collectUsedKeyDirectives', () => {
  it('parses a line comment', () => {
    expect(collectUsedKeyDirectives('// loccy-used-keys: errors.*\nconst k = `errors.${c}`')).toEqual([
      { pattern: 'errors.*', loc: { start: 20, end: 28, line: 0 } },
    ])
  })

  it('splits multiple patterns on commas/whitespace', () => {
    expect(collectUsedKeyDirectives('// loccy-used-keys: errors.*, warnings.*  status').map((d) => d.pattern)).toEqual([
      'errors.*',
      'warnings.*',
      'status',
    ])
  })

  it('strips a block-comment closer', () => {
    expect(collectUsedKeyDirectives('/* loccy-used-keys: errors.* */').map((d) => d.pattern)).toEqual(['errors.*'])
    expect(collectUsedKeyDirectives('<!-- loccy-used-keys: a.b -->').map((d) => d.pattern)).toEqual(['a.b'])
  })

  it('locates each pattern in the file', () => {
    const res = collectUsedKeyDirectives('a\nb\n# loccy-used-keys: x.* y\nc')
    expect(res).toEqual([
      { pattern: 'x.*', loc: { start: 23, end: 26, line: 2 } },
      { pattern: 'y', loc: { start: 27, end: 28, line: 2 } },
    ])
  })

  it('ignores absent or empty directives', () => {
    expect(collectUsedKeyDirectives('const k = t("plain")')).toEqual([])
    expect(collectUsedKeyDirectives('// loccy-used-keys:   ')).toEqual([])
  })
})
