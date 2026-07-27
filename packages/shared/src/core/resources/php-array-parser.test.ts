import { describe, it, expect } from 'vitest'
import { PhpArrayParser } from './php-array-parser'

describe('PhpArrayParser', () => {
  it('parses a real Laravel-style lang file (nested groups, `:placeholder` values)', () => {
    const content = `<?php

return [
    'failed' => 'These credentials do not match our records.',
    'password' => 'The provided password is incorrect.',
    'throttle' => 'Too many login attempts. Please try again in :seconds seconds.',
];
`
    const p = new PhpArrayParser(content)
    expect(p.flatData).toEqual({
      failed: 'These credentials do not match our records.',
      password: 'The provided password is incorrect.',
      throttle: 'Too many login attempts. Please try again in :seconds seconds.',
    })
  })

  it('parses nested associative groups (validation.php `custom` shape)', () => {
    const content = `<?php

return [
    'custom' => [
        'email' => [
            'required' => 'We need to know your email address!',
        ],
    ],
];
`
    const p = new PhpArrayParser(content)
    expect(p.flatData).toEqual({ 'custom.email.required': 'We need to know your email address!' })
  })

  it('parses Laravel choice-pipe plural strings as plain values', () => {
    const content = `<?php

return [
    'apples' => 'There is one apple|There are :count apples',
];
`
    const p = new PhpArrayParser(content)
    expect(p.flatData['apples']).toBe('There is one apple|There are :count apples')
  })

  it("parses an empty array (the format's own declared empty-file content)", () => {
    const p = new PhpArrayParser('<?php\n\nreturn [];\n')
    expect(p.data).toEqual({})
  })

  it('parses a plain (unkeyed) list array without dropping items', () => {
    const p = new PhpArrayParser("<?php\n\nreturn ['nested' => ['a', 'b', 'c']];\n")
    expect(p.data).toEqual({ nested: ['a', 'b', 'c'] })
  })

  it('round-trips single quotes, escaped quotes, and booleans/null/numbers', () => {
    const content = `<?php

return [
    'key' => 'value with \\'quote\\'',
    'flag' => true,
    'empty' => null,
    'count' => 5,
];
`
    const p = new PhpArrayParser(content)
    expect(p.data).toEqual({ key: "value with 'quote'", flag: true, empty: null, count: 5 })
    expect(p.content).toBe(content)
  })

  it('rejects a non-array-returning file (dynamic content)', () => {
    expect(() => new PhpArrayParser('<?php\n\nreturn __DIR__;\n')).toThrow()
  })

  it('rejects malformed PHP syntax', () => {
    expect(() => new PhpArrayParser('<?php\n\nreturn [\n')).toThrow()
  })

  it('preserves tab indentation on write (not silently converted to spaces)', () => {
    const content = "<?php\n\nreturn [\n\t'a' => '1',\n\t'b' => '2',\n];\n"
    const p = new PhpArrayParser(content)
    expect(p.metadata.indentString).toBe('\t')
    p.updateValue('a', '1')
    expect(p.content).toBe(content)
  })

  it('detects indentation from `return` onward, ignoring a blank line after `<?php`', () => {
    const content = "<?php\n\nreturn [\n    'a' => '1',\n];\n"
    const p = new PhpArrayParser(content)
    expect(p.metadata.indentString).toBe('    ')
  })

  it('updateValue / deleteKeypath / renameKeypath', () => {
    const p = new PhpArrayParser("<?php\n\nreturn [\n    'a' => '1',\n    'b' => '2',\n];\n")
    p.updateValue('a', 'ONE')
    expect(p.flatData['a']).toBe('ONE')

    const deleted = p.deleteKeypath('b')
    expect(deleted).toBe('2')
    expect(p.flatData).toEqual({ a: 'ONE' })

    p.renameKeypath('a', 'c')
    expect(p.flatData).toEqual({ c: 'ONE' })
  })

  it('cloneEmpty mirrors metadata with no entries', () => {
    const p = new PhpArrayParser("<?php\n\nreturn [\n\t'a' => '1',\n];\n")
    const empty = p.cloneEmpty()
    expect(empty.data).toEqual({})
    expect(empty.content).toBe('<?php\n\nreturn [];\n')
  })

  it('sorts keys when sortKeys is true', () => {
    const content = "<?php\n\nreturn [\n    'b' => '2',\n    'a' => '1',\n];\n"
    const p = new PhpArrayParser(content, true)
    expect(p.content).toBe("<?php\n\nreturn [\n    'a' => '1',\n    'b' => '2',\n];\n")
  })
})
