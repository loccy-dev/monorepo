// Java `.properties` resource format. Keys are flat, dot-separated strings that ARE the keypaths
// (`welcome.title=Hi` → keypath `welcome.title`), so the data model is a flat `key → string` map
// — no nesting. Supports `=`/`:`/whitespace separators, `#`/`!` comments, line continuations, and
// standard escapes (`\n \t \\ \= \: \uXXXX`). Values are always strings.

import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceFormat } from '../contracts'
import { propertiesKeypathRanges } from './keypath-ranges'
import { resolveSortKeys } from '../loccy-config/defaults-detection/detect-sort-keys'
import { detectTrailingNewLines } from './format-detection'

export interface PropertiesFileMetadata {
  trailingNewLines: number
  sortKeys?: boolean
}

/** Whether the line ends with an odd number of backslashes (→ continues on the next line). */
function hasContinuation(line: string): boolean {
  let slashes = 0
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) slashes++
  return slashes % 2 === 1
}

/** Decode `.properties` escapes in a key or value. */
function unescape(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i]
      continue
    }
    const next = s[++i]
    if (next === 'n') out += '\n'
    else if (next === 't') out += '\t'
    else if (next === 'r') out += '\r'
    else if (next === 'f') out += '\f'
    else if (next === 'u') {
      out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16))
      i += 4
    } else out += next ?? ''
  }
  return out
}

function escapeKey(key: string): string {
  return key.replace(/[\\=: \t\f\n\r]/g, (c) => {
    if (c === '\n') return '\\n'
    if (c === '\t') return '\\t'
    if (c === '\r') return '\\r'
    if (c === '\f') return '\\f'
    return '\\' + c
  })
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\f/g, '\\f')
    .replace(/^ /, '\\ ') // leading space would be stripped on read
}

/** Split a logical line into its raw (still-escaped) key and value at the first `=`/`:`/whitespace. */
function splitEntry(line: string): { rawKey: string; rawValue: string } {
  let i = 0
  while (i < line.length) {
    const c = line[i]!
    if (c === '\\') {
      i += 2
      continue
    }
    if (c === '=' || c === ':' || c === ' ' || c === '\t' || c === '\f') break
    i++
  }
  const rawKey = line.slice(0, i)
  // skip whitespace, then an optional single `=`/`:`, then whitespace → value
  while (i < line.length && /[ \t\f]/.test(line[i]!)) i++
  if (line[i] === '=' || line[i] === ':') {
    i++
    while (i < line.length && /[ \t\f]/.test(line[i]!)) i++
  }
  return { rawKey, rawValue: line.slice(i) }
}

export class PropertiesParser {
  data: NestedObject
  metadata: PropertiesFileMetadata
  sortKeys: boolean

  static fromObject(data: NestedObject, metadata: PropertiesFileMetadata): PropertiesParser {
    const parser = Object.create(PropertiesParser.prototype) as PropertiesParser
    parser.data = data
    parser.metadata = metadata
    parser.sortKeys = resolveSortKeys(data, metadata.sortKeys)
    return parser
  }

  constructor(content: string, sortKeys?: boolean) {
    const data: Record<string, string> = {}
    const lines = content.split(/\r?\n/)

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]!.replace(/^[ \t\f]+/, '') // strip leading whitespace
      if (line === '' || line[0] === '#' || line[0] === '!') continue

      // join line continuations
      while (hasContinuation(line) && i + 1 < lines.length) {
        line = line.slice(0, -1) + lines[++i]!.replace(/^[ \t\f]+/, '')
      }

      const { rawKey, rawValue } = splitEntry(line)
      if (!rawKey) continue
      data[unescape(rawKey)] = unescape(rawValue)
    }

    this.data = data
    this.metadata = { trailingNewLines: detectTrailingNewLines(content), sortKeys }
    this.sortKeys = resolveSortKeys(data, sortKeys)
  }

  private get entries(): [string, string][] {
    const keys = Object.keys(this.data) as string[]
    if (this.sortKeys) keys.sort()
    return keys.map((k) => [k, String((this.data as Record<string, unknown>)[k] ?? '')])
  }

  get content(): string {
    const body = this.entries.map(([k, v]) => `${escapeKey(k)}=${escapeValue(v)}`).join('\n')
    return body + '\n'.repeat(this.metadata.trailingNewLines || 1)
  }

  get flatData(): Record<string, string> {
    return Object.fromEntries(this.entries)
  }

  cloneEmpty(): PropertiesParser {
    return PropertiesParser.fromObject({}, { ...this.metadata })
  }

  updateValue(keypath: string, newValue: string): void {
    ;(this.data as Record<string, unknown>)[keypath] = newValue
  }

  deleteKeypath(keypath: string): string | undefined {
    const prev = (this.data as Record<string, unknown>)[keypath]
    delete (this.data as Record<string, unknown>)[keypath]
    return typeof prev === 'string' ? prev : undefined
  }

  renameKeypath(oldKeypath: string, newKeypath: string): void {
    // rebuild to preserve insertion order (rename in place)
    const rebuilt: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(this.data)) {
      rebuilt[k === oldKeypath ? newKeypath : k] = v
    }
    this.data = rebuilt
  }
}

export const propertiesResourceFormat: ResourceFormat = {
  id: 'properties',
  extensions: ['properties'],
  emptyContent: '',
  parse: (content, sortKeys) => new PropertiesParser(content, sortKeys),
  keypathRanges: propertiesKeypathRanges,
}
