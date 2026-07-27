// Common regex patterns for key detection, via the 'regex' package (extended regex support).

import { pattern, regex } from 'regex'
import type { ParsedExpression, TFuncRegexData } from './types'

export const anyQuoteValue = (name: string): ReturnType<typeof pattern> => pattern`
  (?:
    ' (?<${name}_single> (?: [^'\\] | \\. )*) '
    | " (?<${name}_double> (?: [^"\\] | \\. )*) "
    | \x60 (?<${name}_backtick> (?: [^\x60$\\] | \\. | \$ (?! \{) )* ) \x60
  )
`

export const getAnyQuoteValue = (groups: Record<string, string | undefined>, name: string) =>
  groups[`${name}_single`] ?? groups[`${name}_double`] ?? groups[`${name}_backtick`]

export const tFuncRegexpCommon = (tFunctions: string[]) => {
  // A blank name (e.g. a stray '' in customTranslationFunctions) would otherwise compile to an
  // empty alternation, degenerating into "any '(' not preceded by a word char" — matching far
  // more than intended. `(?!)` never matches, so the whole pattern matches nothing instead.
  const validNames = tFunctions.filter((func) => func.trim().length > 0)
  const tPatterns = validNames.length ? validNames.map((func) => regex`${func}`.source).join(' | ') : '(?!)'

  return regex('g')`
    \g<before> \g<t> \( (?<expression>\g<exp>) \)

    (?(DEFINE)
      (?<before>         (?<! [\w$.] ))
      (?<t>              (?: ${pattern(tPatterns)} ))
      (?<exp>            (?: [^\(\)]++ | \( [^\)]* \) )*+ )
    )
  `
}

/** `tFuncRegexpCommon` + `parseTFuncExpressionCommon` paired as `TFuncRegexData` — the matcher for
 * frameworks whose t-functions are plain `name(...)` calls with a quoted first arg. */
export const tFuncRegexDataCommon = (tFunctions: string[]): TFuncRegexData => ({
  regexp: tFuncRegexpCommon(tFunctions),
  parseExpression: parseTFuncExpressionCommon,
})

export const staticKeypathPattern = regex`
  ^ \s* ${anyQuoteValue('keypath')} \s*
  # Must be followed by comma or end (not +, -, etc.)
  (?= , | $ )
`

export function parseTFuncExpressionCommon(expression: string): ParsedExpression {
  const { firstParam } = splitExpression(expression)
  const groups = firstParam.match(staticKeypathPattern)?.groups ?? {}
  const keypathStatic = getAnyQuoteValue(groups, 'keypath')
  return {
    keypathExpression: {
      content: firstParam,
      clean: firstParam,
    },
    keypathStatic,
  }
}

// Plural-count args in a t-function's options object, e.g. `{ count: n, ordinal: true }`.
// Shared by frameworks whose count lives in a named `count` key (i18next, next-intl).
const tFuncCountPattern = regex`
  count (?: \s* : \s* (?<count> [^,\}]+ ) )? (?= \s* [,\}] )
`
const tFuncOrdinalPattern = regex`
  ordinal \s* : \s* true
`

/** Extract `count`/`ordinal` from a t-function's option params (the text after the first arg). */
export function parseCountArg(otherParams?: string): { count?: string; ordinal?: boolean } {
  if (!otherParams) return {}
  const countMatch = otherParams.match(tFuncCountPattern)
  const count = countMatch ? countMatch.groups?.count?.trim() || 'count' : undefined
  const ordinal = !!otherParams.match(tFuncOrdinalPattern) || undefined
  return { count, ordinal }
}

/** A single numeric-literal positional 2nd arg (`t('k', 2)`) — vue's unambiguous plural signal. */
export function parseNumericCountArg(otherParams?: string): { count?: string } {
  if (!otherParams) return {}
  return /^\s*\d/.test(otherParams) ? { count: 'count' } : {}
}

export function splitExpression(expression: string) {
  const trimmed = expression.trim()
  const commaIndex = findFirstComma(trimmed)
  const firstParam = commaIndex === -1 ? trimmed : trimmed.slice(0, commaIndex).trim()
  const otherParams = commaIndex === -1 ? undefined : trimmed.slice(commaIndex + 1).trim()
  return { firstParam, otherParams }
}

function findFirstComma(str: string): number {
  let depth = 0
  let inString: string | null = null

  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const prev = str[i - 1]

    if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
      if (inString === char) {
        inString = null
      } else if (!inString) {
        inString = char
      }
    }

    if (inString) {
      continue
    }

    if (char === '(' || char === '[' || char === '{') {
      depth++
    }
    if (char === ')' || char === ']' || char === '}') {
      depth--
    }

    if (char === ',' && depth === 0) {
      return i
    }
  }

  return -1
}
