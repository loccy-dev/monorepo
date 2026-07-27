// Fallback framework: no built-in t-function conventions — only `t` plus configured
// `customTranslationFunctions`. Used explicitly (`i18nFramework: custom`), never auto-detected.

import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'
import { tFuncRegexDataCommon } from '../../usages/key-detection/regexps-common'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { scanTFuncNames } from '../common-scan'
import { buildTFunctionCallText } from '../common-insert'

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  return scanTFuncNames(content, ctx, ['t', ...ctx.customFunctionNames], tFuncRegexDataCommon)
}

export const customFramework: I18nFramework = {
  id: 'custom',
  detectFromDeps: () => false,
  defaultFilenameMeaning: 'locale',
  defaultSourceGlob: '**/*.{js,ts,jsx,tsx,vue}',
  detectDefaultNs: async () => NS_WITHOUT_NS,
  scanContent,
  // Unknown convention defaults to icu (value-locus, no accidental key fan-out); override via
  // the `messageFormat` config field for a specific project convention.
  messageFormats: ['icu', 'suffix-cldr', 'vue-pipe'],
  ideInsert: {
    insertTFunctionText: (params) => buildTFunctionCallText(params),
    interpolationWrap: { prefix: '{', suffix: '}', spacing: '' },
    pluralVar: 'count',
  },
}
