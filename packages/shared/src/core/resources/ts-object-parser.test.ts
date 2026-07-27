import { describe, it, expect } from 'vitest'
import { TsObjectParser } from './ts-object-parser'

describe('TsObjectParser', () => {
  it('parses `export default {...}`', () => {
    const p = new TsObjectParser("export default {\n  hello: 'Hi',\n  nested: { world: 'World' },\n}\n")
    expect(p.flatData).toEqual({ hello: 'Hi', 'nested.world': 'World' })
  })

  it('parses `module.exports = {...}`', () => {
    const p = new TsObjectParser("module.exports = {\n  hello: 'Hi',\n}\n")
    expect(p.flatData).toEqual({ hello: 'Hi' })
    expect(p.content).toBe("module.exports = {\n  hello: 'Hi',\n}\n")
  })

  it('parses `export default {...} as const`', () => {
    const p = new TsObjectParser("export default {\n  hello: 'Hi',\n} as const\n")
    expect(p.flatData).toEqual({ hello: 'Hi' })
  })

  it('parses `export default {...} satisfies Messages` (typed next-intl-style messages)', () => {
    const p = new TsObjectParser("export default {\n  hello: 'Hi',\n} satisfies Messages\n")
    expect(p.flatData).toEqual({ hello: 'Hi' })
  })

  it('parses satisfies-typed export preceded by a leading type import', () => {
    const content =
      "import type { Messages } from './types'\n\nexport default {\n  hello: 'Hi',\n} satisfies Messages\n"
    const p = new TsObjectParser(content)
    expect(p.flatData).toEqual({ hello: 'Hi' })
  })

  it('parses object literals with unquoted keys, single quotes, trailing commas, and comments (JSON5)', () => {
    const content = `export default {
  // greeting
  hello: 'Hi',
  'nested.dotted': 'value',
}
`
    const p = new TsObjectParser(content)
    expect(p.flatData).toEqual({ hello: 'Hi', 'nested.dotted': 'value' })
  })

  it('rejects a file with no recognized export wrapper', () => {
    expect(() => new TsObjectParser("const messages = { hello: 'Hi' }\n")).toThrow()
  })

  it('rejects a non-object export (dynamic content)', () => {
    expect(() => new TsObjectParser('export default require("./messages")\n')).toThrow()
  })

  it('preserves tab indentation on write (not silently converted to spaces)', () => {
    const content = "export default {\n\thello: 'Hi',\n\tnested: {\n\t\tworld: 'World',\n\t},\n}\n"
    const p = new TsObjectParser(content)
    expect(p.metadata.indentString).toBe('\t')
    p.updateValue('hello', 'Hi')
    expect(p.content).toBe(content)
  })

  it('updateValue / deleteKeypath / renameKeypath', () => {
    const p = new TsObjectParser("export default {\n  a: '1',\n  b: '2',\n}\n")
    p.updateValue('a', 'ONE')
    expect(p.flatData['a']).toBe('ONE')

    const deleted = p.deleteKeypath('b')
    expect(deleted).toBe('2')
    expect(p.flatData).toEqual({ a: 'ONE' })

    p.renameKeypath('a', 'c')
    expect(p.flatData).toEqual({ c: 'ONE' })
  })

  it('cloneEmpty mirrors metadata (wrapper prefix, indent) with no entries', () => {
    const p = new TsObjectParser("module.exports = {\n\ta: '1',\n}\n")
    const empty = p.cloneEmpty()
    expect(empty.data).toEqual({})
    expect(empty.content).toBe('module.exports = {}\n')
  })

  it('sorts keys when sortKeys is true', () => {
    const content = "export default {\n  b: '2',\n  a: '1',\n}\n"
    const p = new TsObjectParser(content, true)
    expect(p.content).toBe("export default {\n  a: '1',\n  b: '2',\n}\n")
  })
})
