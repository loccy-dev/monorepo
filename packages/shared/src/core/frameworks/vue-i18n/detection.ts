import { regex } from 'regex'
import type { ParsedExpression } from '../../usages/key-detection/types'
import {
  parseNumericCountArg,
  parseTFuncExpressionCommon,
  splitExpression,
  tFuncRegexpCommon,
} from '../../usages/key-detection/regexps-common'

// vue's plural signal is a numeric 2nd positional arg (`$tc('k', 2)`, `t('k', 5)`). A count in a
// variable (`t('k', n)`) is not statically distinguishable from vue's named/list 2nd arg, so only
// the unambiguous numeric-literal case is detected — the plural then lives in the value (vue-pipe).
function parseVueTFuncExpression(expression: string): ParsedExpression {
  const base = parseTFuncExpressionCommon(expression)
  const { otherParams } = splitExpression(expression)
  return { ...base, ...parseNumericCountArg(otherParams) }
}

// <i18n-t /> component
const htmlTagRegex = regex('g')`
  <i18n-t \s
    (?<expression> (?: [^<>]++ | < [^>]* > )*+ )
  >
`
const keypathAttrRegex = regex`
  :keypath \s* = \s* (?<keypathStaticLiteral> "\x60 [^"\x60$]* \x60")
  | :keypath \s* = \s*  (?<keypathStaticQuote> "' [^"']* '")
  | :keypath \s* = \s* (?<keypathExpression> " [^"]* " )
  | keypath \s* = \s* (?<keypathStatic> " [^"]* " )
`

function parseHtmlTagExpression(expression: string): ParsedExpression | null {
  const keypathGroups = expression.match(keypathAttrRegex)?.groups ?? {}

  if (keypathGroups.keypathStaticLiteral) {
    return {
      keypathExpression: {
        content: keypathGroups.keypathStaticLiteral,
        clean: keypathGroups.keypathStaticLiteral.slice(2, -2),
      },
      keypathStatic: keypathGroups.keypathStaticLiteral.slice(2, -2),
    }
  }

  if (keypathGroups.keypathStaticQuote) {
    return {
      keypathExpression: {
        content: keypathGroups.keypathStaticQuote,
        clean: keypathGroups.keypathStaticQuote.slice(2, -2),
      },
      keypathStatic: keypathGroups.keypathStaticQuote.slice(2, -2),
    }
  }

  if (keypathGroups.keypathStatic) {
    return {
      keypathExpression: {
        content: keypathGroups.keypathStatic,
        clean: keypathGroups.keypathStatic.slice(1, -1),
      },
      keypathStatic: keypathGroups.keypathStatic.slice(1, -1),
    }
  }

  if (keypathGroups.keypathExpression) {
    return {
      keypathExpression: {
        content: keypathGroups.keypathExpression,
        clean: keypathGroups.keypathExpression.slice(1, -1),
      },
    }
  }

  return null
}

export const regexpsVueI18n = {
  tFunc: (tFunctions: string[]) => ({
    regexp: tFuncRegexpCommon(tFunctions),
    parseExpression: parseVueTFuncExpression,
  }),
  htmlTag: {
    regexp: htmlTagRegex,
    parseExpression: parseHtmlTagExpression,
  },
}

export const defaultVueI18nTFunctions = ['t', '$t', 'i18n.global.t', '$tc', 'this.t', 'this.$t', 'this.$tc']
