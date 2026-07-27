import { describe, expect, it } from 'vitest'
import { collectUsedKeyDirectives } from './used-key-directives'

describe('collectUsedKeyDirectives', () => {
  it('parses a line comment', () => {
    expect(collectUsedKeyDirectives('// loccy-used-keys: errors.*\nconst k = `errors.${c}`')).toEqual([
      { line: 0, patterns: ['errors.*'] },
    ])
  })

  it('splits multiple patterns on commas/whitespace', () => {
    expect(collectUsedKeyDirectives('// loccy-used-keys: errors.*, warnings.*  status').at(0)?.patterns).toEqual([
      'errors.*',
      'warnings.*',
      'status',
    ])
  })

  it('strips a block-comment closer', () => {
    expect(collectUsedKeyDirectives('/* loccy-used-keys: errors.* */').at(0)?.patterns).toEqual(['errors.*'])
    expect(collectUsedKeyDirectives('<!-- loccy-used-keys: a.b -->').at(0)?.patterns).toEqual(['a.b'])
  })

  it('reports the line of each directive', () => {
    const res = collectUsedKeyDirectives('a\nb\n# loccy-used-keys: x.*\nc')
    expect(res).toEqual([{ line: 2, patterns: ['x.*'] }])
  })

  it('ignores absent or empty directives', () => {
    expect(collectUsedKeyDirectives('const k = t("plain")')).toEqual([])
    expect(collectUsedKeyDirectives('// loccy-used-keys:   ')).toEqual([])
  })
})
