import type { ParsedExpression } from '../../usages/key-detection/types'
import type { TFunctionInfo } from '@repo/types/framework.types'
import {
  getAnyQuoteValue,
  parseCountArg,
  tFuncRegexpCommon,
  splitExpression,
  staticKeypathPattern,
} from '../../usages/key-detection/regexps-common'

function parseTFuncExpression(expression: string): ParsedExpression {
  const { firstParam, otherParams } = splitExpression(expression)
  const keypathStatic = getAnyQuoteValue(firstParam.match(staticKeypathPattern)?.groups ?? {}, 'keypath')
  // next-intl plurals are ICU in the value; the call carries `{ count }`, which types the usage
  // as a plural (single key — icu is value-locus).
  const { count } = parseCountArg(otherParams)
  return {
    keypathExpression: {
      content: firstParam,
      clean: firstParam,
    },
    keypathStatic,
    count,
  }
}

export const regexpsNextIntl = {
  tFunc: (tFunctions: string[]) => ({
    regexp: tFuncRegexpCommon(tFunctions),
    parseExpression: parseTFuncExpression,
  }),
}

// T-function detection helpers

export function getTFunctionsNextIntl(content: string, customFunctions: string[]): TFunctionInfo[] {
  const tInfos: TFunctionInfo[] = []

  // `useTranslations` (client) / `getTranslations` (server, awaited) — the optional string arg is a
  // KEY PREFIX into the single message tree, not an i18next-style namespace (next-intl has none), so
  // it maps to `prefix` and keys resolve as `<prefix>.<key>`.
  const hookPattern =
    /const\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g
  let match
  while ((match = hookPattern.exec(content))) {
    const tName = match[1]
    if (!tName) {
      continue
    }
    const prefix = match[2] || undefined
    if (!tInfos.some((i) => i.tName === tName && i.prefix === prefix)) {
      tInfos.push({ tName, prefix })
    }
  }

  if (tInfos.length) {
    return tInfos
  }

  if (customFunctions.length) {
    return customFunctions.map((tName) => ({ tName }))
  }

  return [{ tName: 't' }]
}
