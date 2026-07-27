import { describe, it, expect } from 'vitest'
import { YamlParser } from './yaml-parser'

describe('YamlParser', () => {
  it('parses nested mappings (vue-i18n-style locale file)', () => {
    const content = `hello: Hi\nnested:\n  world: World\n`
    const p = new YamlParser(content)
    expect(p.flatData).toEqual({ hello: 'Hi', 'nested.world': 'World' })
  })

  it('parses quoted values with special characters, and multiline block scalars', () => {
    const content = `colon: "value: with colon"\nblock: |\n  line1\n  line2\n`
    const p = new YamlParser(content)
    expect(p.flatData['colon']).toBe('value: with colon')
    expect(p.flatData['block']).toBe('line1\nline2\n')
  })

  it('resolves anchors/aliases into plain values', () => {
    const content = `defaults: &defaults\n  greeting: Hi\nen:\n  <<: *defaults\n`
    const p = new YamlParser(content)
    expect(p.flatData['en.greeting']).toBe('Hi')
  })

  it('treats an empty document as an empty resource', () => {
    const p = new YamlParser('')
    expect(p.data).toEqual({})
  })

  it('rejects a non-mapping root (list) instead of silently treating it as empty', () => {
    expect(() => new YamlParser('- a\n- b\n')).toThrow()
  })

  it('rejects a non-mapping root (bare scalar) instead of silently treating it as empty', () => {
    expect(() => new YamlParser('just a string\n')).toThrow()
  })

  it('round-trips 2-space indentation', () => {
    const content = `k:\n  kk: vv1\n  kk2: vv2\n`
    const p = new YamlParser(content)
    expect(p.metadata.indentString).toBe('  ')
    p.updateValue('k.kk', 'vv1')
    expect(p.content).toBe(content)
  })

  it('round-trips 4-space indentation', () => {
    const content = `k:\n    kk: vv1\n`
    const p = new YamlParser(content)
    expect(p.metadata.indentString).toBe('    ')
    expect(p.content).toBe(content)
  })

  it('updateValue / deleteKeypath / renameKeypath', () => {
    const p = new YamlParser('a: "1"\nb: "2"\n')
    p.updateValue('a', 'ONE')
    expect(p.flatData['a']).toBe('ONE')

    const deleted = p.deleteKeypath('b')
    expect(deleted).toBe('2')
    expect(p.flatData).toEqual({ a: 'ONE' })

    p.renameKeypath('a', 'c')
    expect(p.flatData).toEqual({ c: 'ONE' })
  })

  it('cloneEmpty mirrors metadata with no entries', () => {
    const p = new YamlParser('a: "1"\n')
    const empty = p.cloneEmpty()
    expect(empty.data).toEqual({})
  })

  it('sorts keys when sortKeys is true', () => {
    const content = "b: '2'\na: '1'\n"
    const p = new YamlParser(content, true)
    expect(p.content).toBe("a: '1'\nb: '2'\n")
  })
})
