// `loccy-used-keys` magic comments — source-anchored declarations of dynamically-constructed keys.
//
// Written in a comment next to where a key is built at runtime (so the linter can't see it), e.g.
//   // loccy-used-keys: errors.*
//   const key = `errors.${code}`
// The patterns use the same glob/prefix semantics as `isKeypathExcluded`; matching translation keys
// count as used. Living next to the code, a directive is deleted when
// its dynamic construction is — and the linter flags it as stale if it stops matching any key.

import type { Loc } from '@repo/types/platform.types'
import { getLineIndex } from '../helpers/helpers'

/** Anything after the marker up to end-of-line; block-comment closers are stripped below. */
const DIRECTIVE_RE = /loccy-used-keys:[ \t]*([^\n\r]*)/g

export interface UsedKeyDirective {
  /** Declared keypath pattern (glob/prefix, `isKeypathExcluded` semantics). */
  pattern: string
  /** Where the pattern is written in the file. */
  loc: Loc
}

/** Parse every `loccy-used-keys` pattern out of a source file, regardless of comment syntax. */
export function collectUsedKeyDirectives(content: string): UsedKeyDirective[] {
  const directives: UsedKeyDirective[] = []
  for (const match of content.matchAll(DIRECTIVE_RE)) {
    const patternsStart = match.index! + match[0].length - match[1].length
    const raw = match[1].replace(/(\*\/|-->).*$/, '') // drop a `*/` or `-->` closer (and any trailing text) on the same line
    for (const pattern of raw.matchAll(/[^\s,]+/g)) {
      const start = patternsStart + pattern.index!
      directives.push({
        pattern: pattern[0],
        loc: { start, end: start + pattern[0].length, line: getLineIndex(content, start) },
      })
    }
  }
  return directives
}
