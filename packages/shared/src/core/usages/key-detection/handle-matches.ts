// Core matching logic for key detection. Framework-agnostic: a framework supplies the
// regex + expression parser; the active message format decides how a plural usage expands into
// one or more keypaths.

import { getLineIndex } from '../../helpers/helpers'
import { sameLoc } from './helpers'
import type { RegexGroups, TFuncRegexData, DynamicKeyResolverInterface } from './types'
import type { KeypathInfo, TFunctionInfo } from '@repo/types/framework.types'
import type { MessageFormat } from '../../contracts'

export interface HandleMatchesOptions {
  content: string
  regexpData: TFuncRegexData
  defaultNs: string
  dynamicKeyResolver: DynamicKeyResolverInterface | null
  /** Already-collected results — for same-location dedup. */
  existing: KeypathInfo[]
  /** Recurse into the matched expression for nested t-functions. */
  checkNested: boolean
  /** Active message format — decides plural key-expansion. */
  messageFormat: MessageFormat
  tFuncInfo?: TFunctionInfo
  baseOffset?: number
  /** Project locales — for CLDR-driven plural expansion. */
  allLocales?: string[]
  /** Known resource keypaths — for existence-driven expansion (i18next's `_zero` rule). */
  existingKeypaths?: string[]
}

export async function handleMatches(options: HandleMatchesOptions): Promise<KeypathInfo[]> {
  const {
    content: fullContent,
    regexpData,
    defaultNs,
    dynamicKeyResolver,
    existing,
    checkNested,
    messageFormat,
    tFuncInfo,
    baseOffset = 0,
    allLocales = [],
    existingKeypaths = [],
  } = options

  const slice = !!tFuncInfo?.start && !!tFuncInfo.end
  const sliceOffset = slice ? tFuncInfo.start! : 0
  const content = slice ? fullContent.slice(tFuncInfo.start, tFuncInfo.end) : fullContent

  const result: KeypathInfo[] = []
  const matches = content.matchAll(regexpData.regexp)

  for (const match of matches) {
    const keyData = (match.groups ?? {}) as RegexGroups
    if (!keyData.expression) {
      continue
    }

    const parsedExpression = regexpData.parseExpression(keyData.expression)
    const keypathExpression = parsedExpression?.keypathExpression

    if (!keypathExpression) {
      continue
    }

    // primary keypath loc (e.g., for annotation anchor). `content` is a substring of `match[0]`, so
    // indexOf always finds it — the offset of the keypath within the full match.
    const expressionContentStartIndex = match[0].indexOf(keypathExpression.content)
    const annotationStart = baseOffset + sliceOffset + match.index! + expressionContentStartIndex
    const annotationEnd = annotationStart + keypathExpression.content.length
    const annotationLoc = {
      start: annotationStart,
      end: annotationEnd,
      line: getLineIndex(fullContent, annotationStart),
    }

    // clean expression loc for dynamic resolver
    const expressionCleanStartIndex = match[0].indexOf(keypathExpression.clean)
    const expressionCleanStart = baseOffset + sliceOffset + match.index! + expressionCleanStartIndex
    const expressionCleanEnd = expressionCleanStart + keypathExpression.clean.length
    const expressionCleanLoc = {
      start: expressionCleanStart,
      end: expressionCleanEnd,
      line: getLineIndex(fullContent, expressionCleanStart),
    }

    // Skip duplicates at same location
    if (existing.some((e) => sameLoc(e.loc, annotationLoc))) {
      continue
    }

    const count = parsedExpression.count
    const ordinal = parsedExpression.ordinal
    let usedNs = parsedExpression.ns ?? tFuncInfo?.ns
    let nsInKeypath = false

    // i18next dynamic context (`{ context: someVar }`): resolve the variable to its possible string
    // values so `_suffix` keys can be fanned out (static context is applied inline below).
    let resolvedContextValues: string[] = []
    if (parsedExpression.contextDynamic && dynamicKeyResolver) {
      const ctxStartIndex = match[0].indexOf(parsedExpression.contextDynamic)
      const ctxStart = baseOffset + sliceOffset + match.index! + ctxStartIndex
      resolvedContextValues = await dynamicKeyResolver.resolveKey(parsedExpression.contextDynamic, {
        start: ctxStart,
        end: ctxStart + parsedExpression.contextDynamic.length,
        line: getLineIndex(fullContent, ctxStart),
      })
    }

    // resolve keypath
    let type: KeypathInfo['type']
    let keypaths: string[] = []
    if (parsedExpression.keypathStatic) {
      keypaths = [parsedExpression.keypathStatic]
      type = count !== undefined ? 'plurals' : 'static'
    } else if (dynamicKeyResolver) {
      keypaths = await dynamicKeyResolver.resolveKey(keypathExpression.clean, expressionCleanLoc)
      type = keypaths.length ? 'dynamic-defined' : 'dynamic-undefined'
    } else {
      type = 'dynamic-undefined'
    }

    // keypaths post-processing
    keypaths = keypaths.flatMap((keypath) => {
      let baseKey = keypath

      // extract namespace from keypath if present
      if (keypath.includes(':')) {
        const parts = keypath.split(':')
        usedNs = parts.shift()
        baseKey = parts.join(':')
        nsInKeypath = true
      }

      // apply context suffix (static → single key; dynamic → fan out over resolved values)
      let expandedKeypaths = [baseKey]
      if (parsedExpression.contextStatic) {
        expandedKeypaths = expandedKeypaths.map((k) => `${k}_${parsedExpression.contextStatic}`)
      } else if (resolvedContextValues.length) {
        expandedKeypaths = expandedKeypaths.flatMap((k) => resolvedContextValues.map((ctx) => `${k}_${ctx}`))
      }

      // expand plurals per the active message format
      if (count !== undefined) {
        expandedKeypaths = expandedKeypaths.flatMap((k) =>
          messageFormat.expandPluralKeypaths(k, {
            numberType: ordinal ? 'ordinal' : 'cardinal',
            locales: allLocales,
            existingKeypaths,
          }),
        )
      }

      // apply fixed prefix
      if (tFuncInfo?.prefix && baseKey) {
        expandedKeypaths = expandedKeypaths.map((k) => `${tFuncInfo.prefix}.${k}`)
      }

      return expandedKeypaths
    })

    result.push({
      loc: annotationLoc,
      content: keypathExpression.content,
      ns: usedNs ?? defaultNs ?? '',
      // Only when the literal actually spelled it, so the field stays absent in the common case.
      ...(nsInKeypath ? { nsInKeypath: true } : {}),
      prefix: tFuncInfo?.prefix,
      keypaths,
      type,
      ordinal,
    })

    if (checkNested) {
      // recursively search for nested t-functions within the expression
      const nestedMatches = await handleMatches({
        content: keyData.expression,
        regexpData,
        defaultNs,
        dynamicKeyResolver,
        existing: [...existing, ...result],
        checkNested: false,
        messageFormat,
        tFuncInfo,
        baseOffset: annotationLoc.start,
        allLocales,
        existingKeypaths,
      })

      for (const nested of nestedMatches) {
        const adjustedNested = {
          ...nested,
          loc: {
            ...nested.loc,
            line: getLineIndex(fullContent, nested.loc.start),
          },
        }
        // Skip if already exists
        if (!result.some((e) => sameLoc(e.loc, adjustedNested.loc))) {
          result.push(adjustedNested)
        }
      }
    }
  }

  return result
}
