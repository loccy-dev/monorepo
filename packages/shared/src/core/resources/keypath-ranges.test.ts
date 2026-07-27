import { describe, it, expect } from 'vitest'
import { jsonKeypathRanges, yamlKeypathRanges, phpArrayKeypathRanges, propertiesKeypathRanges } from './keypath-ranges'

/** keypath → the substring at its loc, for asserting positions point at the real key. */
const at = (text: string, ranges: { keypath: string; loc: { start: number; end: number } }[]) =>
  Object.fromEntries(ranges.map((r) => [r.keypath, text.slice(r.loc.start, r.loc.end)]))

describe('jsonKeypathRanges', () => {
  it('reports leaf keypaths with key→value ranges (nested + flat)', () => {
    const text = '{\n  "a": {\n    "b": "x"\n  },\n  "c": "y"\n}\n'
    const ranges = jsonKeypathRanges(text)
    expect(ranges.map((r) => r.keypath).sort()).toEqual(['a.b', 'c'])
    const slices = at(text, ranges)
    expect(slices['a.b']).toBe('"b": "x"')
    expect(slices['c']).toBe('"c": "y"')
  })

  it('ignores arrays and non-string leaves are still located', () => {
    const text = '{ "n": 5, "list": ["a","b"], "s": "t" }'
    expect(
      jsonKeypathRanges(text)
        .map((r) => r.keypath)
        .sort(),
    ).toEqual(['n', 's'])
  })
})

describe('jsonKeypathRanges — JS object literal (ts-object)', () => {
  it('handles `export default {…}` with bare identifier + single-quote keys', () => {
    const text = "export default {\n  greeting: { hello: 'Hi' },\n  bye: 'Bye',\n}\n"
    const ranges = jsonKeypathRanges(text)
    expect(ranges.map((r) => r.keypath).sort()).toEqual(['bye', 'greeting.hello'])
    expect(at(text, ranges)['greeting.hello']).toBe("hello: 'Hi'")
  })
})

describe('yamlKeypathRanges', () => {
  it('uses indentation for nesting, one-line leaves', () => {
    const text = 'a:\n  b: x\n  c: y\nd: z\n'
    const ranges = yamlKeypathRanges(text)
    expect(ranges.map((r) => r.keypath)).toEqual(['a.b', 'a.c', 'd'])
    expect(at(text, ranges)['a.b']).toBe('b: x')
    expect(at(text, ranges)['d']).toBe('d: z')
  })

  it('skips comments and list items', () => {
    const text = '# top\na:\n  - one\n  b: v\n'
    expect(yamlKeypathRanges(text).map((r) => r.keypath)).toEqual(['a.b'])
  })
})

describe('propertiesKeypathRanges', () => {
  it('locates flat dotted keys, skipping comments; handles = / : / space separators', () => {
    const text = '# comment\nwelcome.title = Hi\nwelcome.body:Yo\n! bang comment\nplain there\n'
    const ranges = propertiesKeypathRanges(text)
    expect(ranges.map((r) => r.keypath)).toEqual(['welcome.title', 'welcome.body', 'plain'])
    expect(at(text, ranges)['welcome.title']).toBe('welcome.title = Hi')
    expect(at(text, ranges)['welcome.body']).toBe('welcome.body:Yo')
  })
})

describe('phpArrayKeypathRanges', () => {
  it('scans nested `key => value`', () => {
    const text = "<?php\n\nreturn [\n  'a' => [\n    'b' => 'x',\n  ],\n  'c' => 'y',\n];\n"
    const ranges = phpArrayKeypathRanges(text)
    expect(ranges.map((r) => r.keypath).sort()).toEqual(['a.b', 'c'])
    expect(at(text, ranges)['a.b']).toBe("'b' => 'x'")
    expect(at(text, ranges)['c']).toBe("'c' => 'y'")
  })
})
