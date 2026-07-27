import { describe, it, expect } from 'vitest'
import { detectIndentation, detectQuoteStyle, detectTrailingNewLines } from './format-detection'

describe('detectIndentation', () => {
  it('detects 2-space indentation', () => {
    expect(detectIndentation('{\n  "a": 1\n}')).toBe('  ')
  })
  it('detects 4-space indentation', () => {
    expect(detectIndentation('{\n    "a": 1\n}')).toBe('    ')
  })
  it('detects tab indentation', () => {
    expect(detectIndentation('{\n\t"a": 1\n}')).toBe('\t')
  })
  it('returns empty string when no indentation', () => {
    expect(detectIndentation('{"a": 1}')).toBe('')
  })
})

describe('detectTrailingNewLines', () => {
  it('counts zero trailing newlines', () => {
    expect(detectTrailingNewLines('{}')).toBe(0)
  })
  it('counts one trailing newline', () => {
    expect(detectTrailingNewLines('{}\n')).toBe(1)
  })
  it('counts multiple trailing newlines', () => {
    expect(detectTrailingNewLines('{}\n\n\n')).toBe(3)
  })
})

describe('detectQuoteStyle', () => {
  it('picks single when majority', () => {
    expect(detectQuoteStyle("a: 'x'\nb: 'y'\nc: \"z\"")).toBe("'")
  })
  it('picks double when majority', () => {
    expect(detectQuoteStyle('a: "x"\nb: "y"\nc: \'z\'')).toBe('"')
  })
  it('tie-breaks by first occurrence — single first', () => {
    expect(detectQuoteStyle('\'a\' "b"')).toBe("'")
  })
  it('tie-breaks by first occurrence — double first', () => {
    expect(detectQuoteStyle('"a" \'b\'')).toBe('"')
  })
  it('defaults to double when no quotes found', () => {
    expect(detectQuoteStyle('a: x\nb: y')).toBe('"')
  })
})
