import { regex } from 'regex'
import type { ParsedExpression } from '../../usages/key-detection/types'
import type { TFunctionInfo } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import {
  anyQuoteValue,
  getAnyQuoteValue,
  parseCountArg,
  tFuncRegexpCommon,
  splitExpression,
  staticKeypathPattern,
} from '../../usages/key-detection/regexps-common'

const tFuncNsPatternPattern = regex`
  ns \s* : \s* ${anyQuoteValue('ns')}
`
const tFuncContextPattern = regex`
  context \s* : \s*
  (?:
    ${anyQuoteValue('contextStatic')}
    | (?<contextDynamic> [^,\}]+ )
  )
`

function parseTFuncExpression(expression: string): ParsedExpression {
  const { firstParam, otherParams } = splitExpression(expression)

  const keypathGroups = firstParam.match(staticKeypathPattern)?.groups ?? {}
  const keypathStatic = getAnyQuoteValue(keypathGroups, 'keypath')
  const nsGroups = otherParams ? otherParams.match(tFuncNsPatternPattern)?.groups : undefined
  const ns = nsGroups ? getAnyQuoteValue(nsGroups, 'ns') : undefined
  const contextGroups = otherParams?.match(tFuncContextPattern)?.groups ?? {}
  const contextStatic = getAnyQuoteValue(contextGroups, 'contextStatic')
  const contextDynamic = contextGroups.contextDynamic?.trim()
  const { count, ordinal } = parseCountArg(otherParams)

  return {
    keypathExpression: {
      content: firstParam,
      clean: firstParam,
    },
    keypathStatic,
    ns,
    contextStatic,
    contextDynamic,
    count,
    ordinal,
  }
}

// <Trans /> component

// template-literal pattern: `...` — allowed inside JSX-expression attribute values
const tpl = regex`\x60 (?: [^\x60\\] | \\. )* \x60`

const transRegex = regex('g')`
  <Trans \s
    (?<expression> (?: [^<>]++ | < [^>]* > )*+ )
  >
`
const i18nKeyAttrRegex = regex`(?:
    \b i18nKey \s* = \s*
      (?:
        (?<keypathStatic_single> ' (?: [^'\\] | \\. )* ' )
        | (?<keypathStatic_double> " (?: [^"\\] | \\. )* " )
        | (?<keypathExpression> \{ (?: [^\}\x60]++ | ${tpl} | \{ [^\}]* \} )*+ \} )
      )
  )`
const nsAttrRegex = regex`(?:
    \b ns \s* = \s*
      (?:
        ' (?<ns_single> (?: [^'\\] | \\. )* ) '
        | " (?<ns_double> (?: [^"\\] | \\. )* ) "
      )
  )`
const contextAttrRegex = regex`(?:
    \b context \s* = \s*
      (?:
        ' (?<contextStatic_single> (?: [^'\\] | \\. )* ) '
        | " (?<contextStatic_double> (?: [^"\\] | \\. )* ) "
        | \{ (?<contextDynamic> (?: [^\}\x60]+ | ${tpl} )+ ) \}
      )
  )`
const countAttrRegex = regex`(?:
    \b count \s* = \s*
      (?:
        (?<count_expr> \{ (?: [^\}\x60]+ | ${tpl} )+ \} )
        | (?<count_num> \d+ )
      )
  )`

function parseTransExpression(expression: string): ParsedExpression | null {
  const keypathGroups = expression.match(i18nKeyAttrRegex)?.groups ?? {}
  const nsGroups = expression.match(nsAttrRegex)?.groups ?? {}
  const contextGroups = expression.match(contextAttrRegex)?.groups ?? {}
  const countGroups = expression.match(countAttrRegex)?.groups ?? {}

  const ns = nsGroups.ns_single ?? nsGroups.ns_double
  const contextStatic = contextGroups.contextStatic_single ?? contextGroups.contextStatic_double
  const contextDynamic = contextGroups.contextDynamic
  const count = countGroups.count_expr ?? countGroups.count_num

  const keypathExpression =
    keypathGroups.keypathExpression ?? keypathGroups.keypathStatic_single ?? keypathGroups.keypathStatic_double
  if (!keypathExpression) {
    return null
  }

  const keypathStatic = keypathGroups.keypathStatic_single ?? keypathGroups.keypathStatic_double
  return {
    keypathExpression: {
      content: keypathExpression,
      clean: keypathExpression.slice(1, -1),
    },
    keypathStatic: keypathStatic ? keypathStatic.slice(1, -1) : undefined,
    ns,
    contextStatic,
    contextDynamic,
    count,
  }
}

// Default-namespace detection: react-i18next declares it in source (i18next.init / setDefaultNamespace).

export async function detectDefaultNsReactI18next(platform: Platform): Promise<string | null> {
  try {
    const configFiles = await platform.findFiles(['**/*.{js,ts,jsx,tsx}'])

    for (const path of configFiles) {
      try {
        const content = await platform.readFile(path)
        const defaultNs = parseDefaultNsFromSetup(content)
        if (defaultNs) {
          return defaultNs
        }
      } catch {
        // Continue to next file
      }
    }
  } catch {
    // Fall back to generic detection
  }

  return null
}

export function parseDefaultNsFromSetup(content: string): string | undefined {
  // i18next.init({ ... defaultNS: 'value' ... }), across chained calls (.use(...).init(...)) and
  // multiline objects — non-greedy [\s\S]*? matches any character including newlines.
  const initMatch = content.match(/i18next[\s\S]*?\.init[\s\S]*?defaultNS\s*:\s*['"]([^'"]+)['"]/)
  if (initMatch?.[1]) {
    return initMatch[1]
  }

  // Array syntax: defaultNS: ['value']
  const initArrayMatch = content.match(/i18next[\s\S]*?\.init[\s\S]*?defaultNS\s*:\s*\[\s*['"]([^'"]+)['"]/)
  if (initArrayMatch?.[1]) {
    return initArrayMatch[1]
  }

  // i18next.setDefaultNamespace('value')
  const setMatch = content.match(/setDefaultNamespace\s*\(\s*['"]([^'"]+)['"]\s*\)/)
  if (setMatch?.[1]) {
    return setMatch[1]
  }

  return undefined
}

export const regexpsReactI18next = {
  tFunc: (tFunctions: string[]) => ({
    regexp: tFuncRegexpCommon(tFunctions),
    parseExpression: parseTFuncExpression,
  }),
  trans: {
    regexp: transRegex,
    parseExpression: parseTransExpression,
  },
}

// T-function detection helpers

export function getTFunctionsReactI18next(
  content: string,
  defaultNs: string,
  customFunctions: string[],
): TFunctionInfo[] {
  const tInfos: TFunctionInfo[] = []

  const withTranslationMatch = content.match(/\s*withTranslation\(([^)]*)\)/)
  const isClassWrapped = !!withTranslationMatch
  if (isClassWrapped) {
    const ns = parseNsFromUseTranslationArgs(withTranslationMatch[1] ?? '')
    tInfos.push({ tName: 't', ns, prefix: undefined })
  } else {
    tInfos.push(...collectUseTranslationInfos(content))
  }

  if (!tInfos.length && content.match(/i18n\.t\(/)) {
    tInfos.push({ tName: 'i18n.t' })
  }

  tInfos.push(...collectTranslationRenderProps(content, defaultNs))

  if (tInfos.length) {
    return tInfos
  }

  if (customFunctions.length) {
    return customFunctions.map((tName) => ({ tName }))
  }
  return [{ tName: 'i18n' }]
}

function collectUseTranslationInfos(content: string): TFunctionInfo[] {
  const result: TFunctionInfo[] = []
  const pattern = /const\s*\{\s*([^}]+)\s*\}\s*=\s*useTranslation\s*\(\s*([^)]*)\s*\)\s*;?/g
  let match
  while ((match = pattern.exec(content))) {
    const destructStr = match[1] ?? ''
    const argsStr = match[2] ?? ''
    const tName = parseTDestruct(destructStr)
    const ns = parseNsFromUseTranslationArgs(argsStr)
    const prefix = parsePrefix(argsStr)
    result.push({ tName, ns, prefix })
  }
  return result
}

function collectTranslationRenderProps(content: string, globalDefault: string): TFunctionInfo[] {
  const result: TFunctionInfo[] = []
  const pattern = /<Translation([^>]*)>\s*\{\s*\(([^\)]+)\)\s*=>(.*?)<\/Translation>/gs
  let match
  while ((match = pattern.exec(content))) {
    const tName = parseTDestruct(match[2] ?? '')

    const propsStr = match[1] ?? ''
    let ns: string | undefined = undefined
    const nsMatch = propsStr.match(/ns=(?:'([^']*)'|"([^"]*)"|{([^}]*)})/)
    if (nsMatch) {
      let nsValue = nsMatch[1] || nsMatch[2] || nsMatch[3]
      if (nsValue) {
        ns = parseNsFromUseTranslationArgs(nsValue)
      }
    }

    result.push({
      tName,
      ns,
      prefix: undefined,
      start: match.index + match[0].length - '</Translation>'.length - (match[3] ?? '').length,
      end: match.index + match[0].length - '</Translation>'.length,
    })
  }
  return result
}

function parseNsFromUseTranslationArgs(nsArg: string) {
  let nsArgTrimmed = nsArg.trim()

  const argsWithPropsMatch = nsArgTrimmed.match(/([^,]*)\s*\,\s*\{/)
  if (argsWithPropsMatch) {
    nsArgTrimmed = (argsWithPropsMatch[1] ?? '').trim()
  }

  if (!nsArgTrimmed) {
    return undefined
  }

  if (nsArgTrimmed.startsWith('[') && nsArgTrimmed.endsWith(']')) {
    const arrayItems = nsArgTrimmed
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim().replace(/['"`]/g, ''))
    return arrayItems[0]
  } else {
    return nsArgTrimmed.replace(/['"`]/g, '')
  }
}

function parsePrefix(prefixArg: string) {
  const argsTrimmed = prefixArg.trim()
  if (!argsTrimmed) {
    return undefined
  }
  const keyPrefixMatch = argsTrimmed.match(/keyPrefix\s*:\s*['"`]([^'"`]+)['"`]/)
  return keyPrefixMatch ? keyPrefixMatch[1] : undefined
}

function parseTDestruct(content: string): string {
  const match = content.match(/t\s*:\s*(\w+)/)
  return match?.[1] ?? 't'
}
