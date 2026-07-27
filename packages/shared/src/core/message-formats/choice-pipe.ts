// choice-pipe — Laravel/Symfony `trans_choice` pluralization: `|`-separated segments, optionally
// prefixed with an exact `{n}` or interval `[a,b]`/`[a,*]` selector. Value-locus. Intervals
// collapse to their catch-all (`[n,n]` → `=n`, wider/open → `other`) — the format's defined
// mapping, not a lossy accident.

import type { MessageFormat, PluralValueCodec } from '../contracts'
import type { PluralModel } from '@repo/types/plurals.types'
import { cldrValueCodecDefaults, orderedBranchKeys, positionalBranches } from '../plurals/plural-model'

const EXACT = /^\{\s*(\d+)\s*\}\s*/
const INTERVAL = /^[[\]]\s*(-?\d+)\s*,\s*(-?\d+|\*|-?Inf)\s*[[\]]\s*/

function parseSegments(value: string, locale: string): PluralModel['branches'] | null {
  const segments = value.split('|').map((s) => s.trim())
  if (segments.length < 2) return null

  const hasSelector = segments.some((s) => EXACT.test(s) || INTERVAL.test(s))
  if (!hasSelector) return positionalBranches(segments, locale)

  const branches: PluralModel['branches'] = {}
  for (const segment of segments) {
    const exact = segment.match(EXACT)
    if (exact) {
      branches[`=${Number(exact[1])}`] = segment.slice(exact[0].length)
      continue
    }
    const interval = segment.match(INTERVAL)
    if (interval) {
      const [, low, high] = interval
      if (low === high) branches[`=${Number(low)}`] = segment.slice(interval[0].length)
      else branches.other = segment.slice(interval[0].length)
      continue
    }
    branches.other ??= segment // a selectorless segment among explicit ones → catch-all
  }
  return branches
}

const choicePipeValueCodec: PluralValueCodec = {
  parseValue(value, locale) {
    const branches = parseSegments(value, locale)
    return branches ? { numberType: 'cardinal', countVar: 'count', branches } : null
  },

  serializeValue(model) {
    const keys = orderedBranchKeys(model.branches)
    // exact-only → `{n} msg`; else positional in canonical order (all forms the locale requires).
    if (keys.length && keys.every((k) => k.startsWith('='))) {
      return keys.map((k) => `{${k.slice(1)}} ${model.branches[k]}`).join('|')
    }
    return keys.map((k) => model.branches[k]).join('|')
  },

  ...cldrValueCodecDefaults,
}

export const choicePipeMessageFormat: MessageFormat = {
  id: 'choice-pipe',
  interpolation: { open: ':', close: '', number: ':count' }, // Laravel `:name` placeholders
  expandPluralKeypaths: (baseKey) => [baseKey],
  valueCodec: choicePipeValueCodec,
}
