import type { KeypathInfo } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import { detectDefaultNsFromResources } from '../../loccy-config/defaults-detection/detect-default-ns'
import { detectDefaultNsReactI18next, getTFunctionsReactI18next, regexpsReactI18next } from './detection'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { buildTFunctionCallText } from '../common-insert'
import { runMatchPass } from '../common-scan'

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  const tInfos = getTFunctionsReactI18next(content, ctx.defaultNs, ctx.customFunctionNames)
  let keyInfos: KeypathInfo[] = []

  // t-func
  const genericTFunctions = [...new Set(['t', 'this.props.t', ...ctx.customFunctionNames])]
  for (const tName of genericTFunctions) {
    if (!tInfos.find((info) => info.tName === tName)) {
      tInfos.push({ tName })
    }
  }

  for (const tInfo of tInfos) {
    keyInfos = await runMatchPass(keyInfos, content, ctx, regexpsReactI18next.tFunc([tInfo.tName]), {
      checkNested: true,
      tFuncInfo: tInfo,
    })
  }

  // <Trans />
  keyInfos = await runMatchPass(keyInfos, content, ctx, regexpsReactI18next.trans, { checkNested: false })

  return keyInfos
}

async function detectDefaultNs(platform: Platform, translationFileRelativePaths: string[]): Promise<string> {
  const defaultNs = await detectDefaultNsReactI18next(platform)
  return defaultNs ?? detectDefaultNsFromResources(translationFileRelativePaths, ['translation'])
}

export const reactI18nextFramework: I18nFramework = {
  id: 'react-i18next',
  detectFromDeps: (allDeps) => allDeps.has('react-i18next'),
  defaultFilenameMeaning: 'namespace',
  defaultSourceGlob: '**/*.{js,ts,jsx,tsx}',
  detectDefaultNs,
  scanContent,
  // i18next's default is suffix keys; installing `i18next-icu` switches values to inline ICU.
  messageFormats: ['suffix-cldr', 'icu'],
  resolveMessageFormat: (allDeps) => (allDeps.has('i18next-icu') ? 'icu' : 'suffix-cldr'),
  ideInsert: {
    insertTFunctionText: (params) =>
      buildTFunctionCallText(params, (tFunctionInfo, qt) =>
        tFunctionInfo.ns ? [`ns: ${qt}${tFunctionInfo.ns}${qt}`] : [],
      ),
    interpolationWrap: { prefix: '{{', suffix: '}}', spacing: '' },
    pluralVar: 'count',
    linkedMessageUtils: {
      regex: /\$t\(([a-zA-Z0-9_.:]+)\)/g, // supports $t(key) and $t(ns:key)
      build: (keypath, targetNs) => (targetNs ? `$t(${targetNs}:${keypath})` : `$t(${keypath})`), // TODO: change caller logic, be careful
      parse: (ref) => {
        if (ref.includes(':')) {
          const parts = ref.split(':')
          return { keypath: parts.slice(1).join(':'), ns: parts[0] }
        }
        return { keypath: ref }
      },
    },
  },
}
