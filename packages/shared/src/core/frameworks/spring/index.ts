// Spring (Java): `MessageSource.getMessage("code", …)`, `.properties` bundles named
// `messages_<locale>.properties`. Calls are receiver-qualified, which the shared tFunc regex
// rejects, so this defines its own receiver-allowing matcher below.

import { pattern, regex } from 'regex'
import type { KeypathInfo } from '@repo/types/framework.types'
import { detectDefaultNsFromResources } from '../../loccy-config/defaults-detection/detect-default-ns'
import { parseTFuncExpressionCommon } from '../../usages/key-detection/regexps-common'
import type { TFuncRegexData } from '../../usages/key-detection/types'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { scanTFuncNames } from '../common-scan'
import { stripTFunctionPrefix } from '../common-insert'

const SPRING_T_FUNCTIONS = ['getMessage']

// Matches an optional `foo.bar.` receiver chain, then a t-name, then a REQUIRED quoted first arg.
// The trailing `(` rejects longer identifiers (`getMessageThing(`); the quote lookahead rejects
// key-less calls (`err.getMessage()`). The `expression` group feeds `parseTFuncExpressionCommon`.
const springTFuncRegexp = (tFunctions: string[]): RegExp => {
  const validNames = tFunctions.filter((name) => name.trim().length > 0)
  const namePattern = validNames.length ? validNames.map((name) => regex`${name}`.source).join(' | ') : '(?!)'

  return regex('g')`
    (?<! [\w$.] )
    (?: [\w$]+ \s* \. \s* )*
    (?: ${pattern(namePattern)} )
    \( (?= \s* ['"\x60] )
    (?<expression> (?: [^\(\)]++ | \( [^\)]* \) )*+ )
    \)
  `
}

const springRegexData = (tFunctions: string[]): TFuncRegexData => ({
  regexp: springTFuncRegexp(tFunctions),
  parseExpression: parseTFuncExpressionCommon,
})

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  return scanTFuncNames(content, ctx, [...SPRING_T_FUNCTIONS, ...ctx.customFunctionNames], springRegexData)
}

export const springFramework: I18nFramework = {
  id: 'spring',
  // No cheap auto-detect signal (deps live in pom.xml/build.gradle) — explicit config only.
  detectFromDeps: () => false,
  defaultFilenameMeaning: 'locale',
  // Bundles carry a `messages_` basename prefix the derived layout wouldn't produce; the
  // irregular no-suffix root `messages.properties` is out of scope — set an explicit layout for it.
  defaultLayout: 'messages_{locale}.properties',
  defaultSourceGlob: '**/*.{java,jsp,html}',
  detectDefaultNs: async (_platform, translationFileRelativePaths) =>
    detectDefaultNsFromResources(translationFileRelativePaths, ['messages']),
  scanContent,
  // Spring resolves messages via java.text.MessageFormat (ICU-style `{0}`/`{0,plural,…}`); icu is
  // the neutral value-locus default (no accidental key fan-out) for the `.properties` storage.
  messageFormats: ['icu'],
  ideInsert: {
    // Java MessageFormat is positional: the plural arg is index `{0}` in the value and passed as
    // `new Object[]{count}`. Receiver + locale are project-specific — a `locale` stub the user wires.
    insertTFunctionText: ({ tFunctionInfo, keypath, quoteType, count }) => {
      const qt = quoteType === 'single' ? "'" : '"'
      const call = `${tFunctionInfo.tName}(${qt}${stripTFunctionPrefix(keypath, tFunctionInfo.prefix)}${qt}`
      return count ? `${call}, new Object[]{ ${count.expr ?? 'count'} }, locale)` : `${call})`
    },
    interpolationWrap: { prefix: '{', suffix: '}', spacing: '' },
    // The count is argument index `0` in the ICU value (`{0, plural, …}`), per Java MessageFormat.
    pluralVar: '0',
  },
}
