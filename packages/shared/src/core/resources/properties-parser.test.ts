import { describe, it, expect } from 'vitest'
import { PropertiesParser } from './properties-parser'

describe('PropertiesParser', () => {
  it('parses flat dotted keys with =, :, and space separators; skips comments', () => {
    const p = new PropertiesParser('# c\nwelcome.title = Hi\nwelcome.body:Yo\ngreeting hello\n! bang\n')
    expect(p.flatData).toEqual({ 'welcome.title': 'Hi', 'welcome.body': 'Yo', greeting: 'hello' })
  })

  it('handles escapes and line continuations', () => {
    const p = new PropertiesParser('a.b = line1 \\\n  line2\nk\\=eq = v\ntab = x\\ty\n')
    expect(p.flatData['a.b']).toBe('line1 line2')
    expect(p.flatData['k=eq']).toBe('v')
    expect(p.flatData['tab']).toBe('x\ty')
  })

  it('round-trips through content (key=value per line)', () => {
    const p = new PropertiesParser('a.b=Hi\nc.d=Yo\n')
    expect(p.content).toBe('a.b=Hi\nc.d=Yo\n')
  })

  it('updateValue sets a flat key; renameKeypath preserves order', () => {
    const p = new PropertiesParser('a=1\nb=2\n', false)
    p.updateValue('a', 'ONE')
    expect(p.flatData['a']).toBe('ONE')
    p.renameKeypath('a', 'z')
    expect(Object.keys(p.flatData)).toEqual(['z', 'b'])
    expect(p.flatData['z']).toBe('ONE')
  })

  it('escapes separators/newlines on write', () => {
    const p = PropertiesParser.fromObject({ 'a.b': 'x\ny' }, { trailingNewLines: 1 })
    expect(p.content).toBe('a.b=x\\ny\n')
  })

  it('sortKeys undefined ("auto") detects from existing key order, like the other resource parsers', () => {
    const sorted = new PropertiesParser('a=1\nb=2\nc=3\n')
    expect(sorted.sortKeys).toBe(true)

    const unsorted = new PropertiesParser('b=2\na=1\nc=3\n')
    expect(unsorted.sortKeys).toBe(false)
  })
})
