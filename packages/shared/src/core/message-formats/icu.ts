// icu — Unicode MessageFormat: the whole plural lives in one value, e.g.
// `{count, plural, one {# item} other {# items}}`. Value-locus.
//
// Hand-rolled, dependency-free, brace-aware decomposer — only the plural/selectordinal argument
// is needed, not a full ICU AST, and this package must stay browser-safe with no heavy deps.
// Escaped braces and surrounding text outside the plural argument are out of scope: a value that
// isn't exactly one plural argument parses to `null`.

import type { MessageFormat, PluralValueCodec } from '../contracts'
import type { PluralBranchKey, PluralModel } from '@repo/types/plurals.types'
import { cldrValueCodecDefaults, orderedBranchKeys } from '../plurals/plural-model'

/** Index of the `}` matching the `{` at `open`, or -1. Depth-counting only (no quote handling). */
function matchBrace(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) return i
  }
  return -1
}

const HEAD = /^\s*([^\s,{}]+)\s*,\s*(plural|selectordinal)\s*,\s*/
const OFFSET = /^offset:\d+\s*/
const SELECTOR = /^\s*(=\d+|\w+)\s*\{/

/** Parse a value that is exactly one ICU plural/selectordinal argument. */
function parseIcuPlural(value: string): PluralModel | null {
  const trimmed = value.trim()
  if (trimmed[0] !== '{') return null
  const close = matchBrace(trimmed, 0)
  if (close !== trimmed.length - 1) return null // must be a single argument spanning the whole value

  const inner = trimmed.slice(1, close)
  const head = inner.match(HEAD)
  if (!head) return null

  const countVar = head[1]!
  const numberType = head[2] === 'selectordinal' ? 'ordinal' : 'cardinal'
  let rest = inner.slice(head[0].length).replace(OFFSET, '') // `offset:` is dropped in v1

  const branches: PluralModel['branches'] = {}
  while (rest.length) {
    const sel = rest.match(SELECTOR)
    if (!sel) break
    const braceOpen = sel[0].length - 1
    const braceClose = matchBrace(rest, braceOpen)
    if (braceClose === -1) return null
    branches[sel[1] as PluralBranchKey] = rest.slice(braceOpen + 1, braceClose)
    rest = rest.slice(braceClose + 1)
  }

  return Object.keys(branches).length ? { numberType, countVar, branches } : null
}

const icuValueCodec: PluralValueCodec = {
  parseValue: (value) => parseIcuPlural(value),

  serializeValue(model) {
    const keyword = model.numberType === 'ordinal' ? 'selectordinal' : 'plural'
    const body = orderedBranchKeys(model.branches)
      .map((key) => `${key} {${model.branches[key]}}`)
      .join(' ')
    return `{${model.countVar}, ${keyword}, ${body}}`
  },

  // ICU mandates `other` for every plural, regardless of locale.
  ...cldrValueCodecDefaults,
}

export const icuMessageFormat: MessageFormat = {
  id: 'icu',
  interpolation: { open: '{', close: '}', number: '#' },
  expandPluralKeypaths: (baseKey) => [baseKey],
  valueCodec: icuValueCodec,
}
