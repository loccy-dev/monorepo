import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'
import { getTFunctionsNextIntl, regexpsNextIntl } from './detection'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { buildTFunctionCallText } from '../common-insert'
import { runMatchPass } from '../common-scan'

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  const tInfos = getTFunctionsNextIntl(content, ctx.customFunctionNames)
  let keyInfos: KeypathInfo[] = []

  const genericTFunctions = [...new Set(['t', ...ctx.customFunctionNames])]
  for (const tName of genericTFunctions) {
    if (!tInfos.find((info) => info.tName === tName)) {
      tInfos.push({ tName })
    }
  }

  for (const tInfo of tInfos) {
    keyInfos = await runMatchPass(keyInfos, content, ctx, regexpsNextIntl.tFunc([tInfo.tName]), {
      checkNested: true,
      tFuncInfo: tInfo,
    })
  }

  return keyInfos
}

export const nextIntlFramework: I18nFramework = {
  id: 'next-intl',
  detectFromDeps: (allDeps) => allDeps.has('next-intl'),
  defaultFilenameMeaning: 'locale',
  defaultSourceGlob: '**/*.{js,ts,jsx,tsx}',
  detectDefaultNs: async () => NS_WITHOUT_NS,
  scanContent,
  messageFormats: ['icu'],
  ideInsert: {
    insertTFunctionText: (params) => buildTFunctionCallText(params),
    interpolationWrap: { prefix: '{', suffix: '}', spacing: '' },
    pluralVar: 'count',
    // linked-message resolution (`@:key` / `$t(key)`) intentionally not supported for next-intl
  },
}
