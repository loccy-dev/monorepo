// Position-aware scanners: given raw resource-file content, report each leaf keypath's source
// range (key start → value end). Distinct from the format parsers (which discard positions on
// reserialize) — these power in-editor annotations, one scanner per resource format.

import type { KeypathRange } from '../contracts'
import { getLineIndex } from '../helpers/helpers'

/** Line number (1-based) of a character offset. */
function lineAt(text: string, offset: number): number {
  return getLineIndex(text, offset) + 1
}

/** Start offset of each line in `lines` (the same split array the caller iterates). */
function lineStartOffsets(lines: string[]): number[] {
  const starts: number[] = []
  let offset = 0
  for (const line of lines) {
    starts.push(offset)
    offset += line.length + 1
  }
  return starts
}

// --- JSON / JS-object (json, ts-object) ---

/**
 * Scan a JSON or JS-object-literal document (`{…}`, optionally after `export default`/`= `/`(…)`).
 * Handles single/double quotes and bare identifier keys; records each leaf's key-start→value-end.
 */
export function jsonKeypathRanges(text: string): KeypathRange[] {
  const result: KeypathRange[] = []
  const start = text.indexOf('{')
  if (start === -1) return result

  let pos = start

  const skipWs = () => {
    while (pos < text.length && /\s/.test(text[pos]!)) pos++
  }
  const parseString = (): void => {
    const quote = text[pos]
    pos++
    while (pos < text.length && text[pos] !== quote) {
      if (text[pos] === '\\') pos++
      pos++
    }
    pos++ // closing quote
  }
  const parseIdent = (): void => {
    while (pos < text.length && /[a-zA-Z0-9_$]/.test(text[pos]!)) pos++
  }

  const parseValue = (path: string[]): void => {
    skipWs()
    const ch = text[pos]
    if (ch === '{') {
      parseObject(path)
    } else if (ch === '[') {
      // skip array (arrays aren't addressable keypaths)
      let depth = 0
      do {
        if (text[pos] === '[') depth++
        else if (text[pos] === ']') depth--
        else if (text[pos] === '"' || text[pos] === "'") {
          parseString()
          continue
        }
        pos++
      } while (pos < text.length && depth > 0)
    } else if (ch === '"' || ch === "'") {
      parseString()
    } else {
      // number / boolean / null / bare token
      while (pos < text.length && !/[,}\]]/.test(text[pos]!)) pos++
    }
  }

  function parseObject(path: string[]): void {
    pos++ // '{'
    skipWs()
    while (pos < text.length && text[pos] !== '}') {
      skipWs()
      if (text[pos] === '}') break

      const keyStart = pos
      let key: string
      if (text[pos] === '"' || text[pos] === "'") {
        const q = text[pos]
        const s = pos + 1
        parseString()
        key = text.slice(s, pos - 1).replace(new RegExp(`\\\\${q}`, 'g'), q!)
      } else {
        const s = pos
        parseIdent()
        key = text.slice(s, pos)
      }

      skipWs()
      if (text[pos] !== ':') break
      pos++ // ':'
      skipWs()

      const keyPath = [...path, key]
      const valueStart = pos
      // a leaf is a scalar — objects (`{`) recurse, arrays (`[`) aren't addressable keypaths
      const isLeaf = text[valueStart] !== '{' && text[valueStart] !== '['
      parseValue(keyPath)
      if (isLeaf) {
        result.push({ keypath: keyPath.join('.'), loc: { start: keyStart, end: pos, line: lineAt(text, keyStart) } })
      }

      skipWs()
      if (text[pos] === ',') {
        pos++
        skipWs()
      }
    }
    pos++ // '}'
  }

  try {
    parseObject([])
  } catch {
    // best-effort — malformed content yields whatever we scanned so far
  }
  return result
}

// --- YAML ---

/** Scan a YAML document: indentation → nesting, `key: value` leaves. Skips comments, lists, blocks. */
export function yamlKeypathRanges(text: string): KeypathRange[] {
  const result: KeypathRange[] = []
  const lines = text.split('\n')
  const lineStarts = lineStartOffsets(lines)
  const stack: { indent: number; key: string }[] = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineStart = lineStarts[i]!

    const trimmedStart = raw.length - raw.trimStart().length
    const content = raw.trim()
    if (!content || content.startsWith('#') || content.startsWith('-')) continue

    const colon = content.indexOf(':')
    if (colon === -1) continue

    const indent = trimmedStart
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()

    const key = content
      .slice(0, colon)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    const rest = content.slice(colon + 1).trim()
    const keyStart = lineStart + trimmedStart

    if (rest && !rest.startsWith('#') && rest !== '|' && rest !== '>') {
      // leaf: key: value on one line
      const keypath = [...stack.map((s) => s.key), key].join('.')
      result.push({ keypath, loc: { start: keyStart, end: lineStart + raw.length, line: i + 1 } })
    } else {
      // parent (nested block follows)
      stack.push({ indent, key })
    }
  }
  return result
}

// --- Java .properties (`key=value` / `key:value` / `key value`) ---

/** Decode the escapes that can appear in a `.properties` key (to match the parsed keypath). */
function unescapePropertiesKey(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i]
      continue
    }
    const next = s[++i]
    if (next === 'u') {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16))
      i += 4
    } else out += next ?? ''
  }
  return out
}

/** Scan a `.properties` document: one leaf per non-comment line, key → line-end. */
export function propertiesKeypathRanges(text: string): KeypathRange[] {
  const result: KeypathRange[] = []
  const lines = text.split('\n')
  const lineStarts = lineStartOffsets(lines)

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!
    const lineStart = lineStarts[i]!

    const leading = raw.length - raw.replace(/^[ \t\f]+/, '').length
    const stripped = raw.slice(leading)
    if (stripped === '' || stripped[0] === '#' || stripped[0] === '!') continue

    let j = 0
    while (j < stripped.length) {
      const c = stripped[j]!
      if (c === '\\') {
        j += 2
        continue
      }
      if (c === '=' || c === ':' || c === ' ' || c === '\t' || c === '\f') break
      j++
    }
    if (j === 0) continue

    const keyStart = lineStart + leading
    result.push({
      keypath: unescapePropertiesKey(stripped.slice(0, j)),
      loc: { start: keyStart, end: lineStart + raw.length, line: i + 1 },
    })
  }
  return result
}

// --- PHP array (`'key' => value`) ---

/** Scan a `<?php return [ 'k' => 'v', 'nested' => [ … ] ];` document. */
export function phpArrayKeypathRanges(text: string): KeypathRange[] {
  const result: KeypathRange[] = []
  const stack: string[] = []
  let pos = 0

  const skipTrivia = () => {
    while (pos < text.length) {
      if (/\s/.test(text[pos]!)) pos++
      else if (text[pos] === ',') pos++
      else if (text.startsWith('//', pos)) {
        while (pos < text.length && text[pos] !== '\n') pos++
      } else if (text.startsWith('#', pos)) {
        while (pos < text.length && text[pos] !== '\n') pos++
      } else if (text.startsWith('/*', pos)) {
        pos = text.indexOf('*/', pos)
        pos = pos === -1 ? text.length : pos + 2
      } else break
    }
  }
  const readString = (): string => {
    const quote = text[pos]
    const s = pos + 1
    pos++
    while (pos < text.length && text[pos] !== quote) {
      if (text[pos] === '\\') pos++
      pos++
    }
    const value = text.slice(s, pos)
    pos++ // closing quote
    return value.replace(/\\(['"\\])/g, '$1')
  }

  while (pos < text.length) {
    skipTrivia()
    if (pos >= text.length) break
    const ch = text[pos]

    if (ch === ']') {
      pos++
      stack.pop()
      continue
    }
    if (ch === '[') {
      // array not preceded by a key (top-level `return [`) — descend anonymously
      pos++
      stack.push('')
      continue
    }
    if (ch === '"' || ch === "'") {
      const keyStart = pos
      const key = readString()
      skipTrivia()
      if (text.startsWith('=>', pos)) {
        pos += 2
        skipTrivia()
        if (text[pos] === '[') {
          pos++
          stack.push(key)
        } else {
          // leaf value
          const path = [...stack.filter(Boolean), key].join('.')
          if (text[pos] === '"' || text[pos] === "'") readString()
          else while (pos < text.length && !/[,\]]/.test(text[pos]!)) pos++
          result.push({ keypath: path, loc: { start: keyStart, end: pos, line: lineAt(text, keyStart) } })
        }
      }
      continue
    }
    pos++ // skip `<?php`, `return`, etc.
  }
  return result
}
