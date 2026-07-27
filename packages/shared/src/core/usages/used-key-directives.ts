// `loccy-used-keys` magic comments — source-anchored declarations of dynamically-constructed keys.
//
// Written in a comment next to where a key is built at runtime (so the linter can't see it), e.g.
//   // loccy-used-keys: errors.*
//   const key = `errors.${code}`
// The patterns use the same glob/prefix semantics as `isKeypathExcluded`; matching translation keys
// are treated as used by the unused-keys check. Living next to the code, a directive is deleted when
// its dynamic construction is — and the linter flags it as stale if it stops matching any key.

import { getLineIndex } from '../helpers/helpers'

/** Anything after the marker up to end-of-line; block-comment closers are stripped below. */
const DIRECTIVE_RE = /loccy-used-keys:[ \t]*([^\n\r]*)/g

export interface UsedKeyDirective {
  /** 0-based line index of the directive in the file. */
  line: number
  /** Declared keypath patterns (glob/prefix, `isKeypathExcluded` semantics). */
  patterns: string[]
}

/** Parse every `loccy-used-keys` directive out of a source file, regardless of comment syntax. */
export function collectUsedKeyDirectives(content: string): UsedKeyDirective[] {
  const directives: UsedKeyDirective[] = []
  for (const match of content.matchAll(DIRECTIVE_RE)) {
    const raw = match[1]
      .replace(/(\*\/|-->).*$/, '') // drop a `*/` or `-->` closer (and any trailing text) on the same line
      .trim()
    const patterns = raw.split(/[\s,]+/).filter(Boolean)
    if (patterns.length) directives.push({ line: getLineIndex(content, match.index!), patterns })
  }
  return directives
}
