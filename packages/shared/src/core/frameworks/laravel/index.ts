// Laravel (PHP) translation-function convention (`__`, `trans`, `trans_choice`, Blade `@lang`).
// The common tFunc regex/parser is language-agnostic, so no PHP-specific matcher is needed.

import type { KeypathInfo } from '@repo/types/framework.types'
import { detectDefaultNsFromResources } from '../../loccy-config/defaults-detection/detect-default-ns'
import { tFuncRegexDataCommon } from '../../usages/key-detection/regexps-common'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { scanTFuncNames } from '../common-scan'
import { buildTFunctionCallText } from '../common-insert'

const LARAVEL_T_FUNCTIONS = ['__', 'trans', 'trans_choice', 'lang']

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  return scanTFuncNames(content, ctx, [...LARAVEL_T_FUNCTIONS, ...ctx.customFunctionNames], tFuncRegexDataCommon)
}

export const laravelFramework: I18nFramework = {
  id: 'laravel',
  detectFromDeps: (allDeps) => allDeps.has('laravel/framework'),
  defaultFilenameMeaning: 'namespace',
  defaultSourceGlob: '**/*.{php,blade.php}',
  detectDefaultNs: async (_platform, translationFileRelativePaths) =>
    detectDefaultNsFromResources(translationFileRelativePaths, ['messages']),
  scanContent,
  // `trans_choice('one apple|:count apples', $n)` — pipe segments with optional `{n}`/`[a,b]`
  // selectors, driven by the format's value codec.
  messageFormats: ['choice-pipe'],
  ideInsert: {
    // Plurals switch the call to `trans_choice('key', $count)` (positional count); otherwise the
    // detected `__`/`trans` call. The count var is a PHP variable, hence `$count`.
    insertTFunctionText: (params) =>
      params.count
        ? buildTFunctionCallText(
            { ...params, tFunctionInfo: { ...params.tFunctionInfo, tName: 'trans_choice' } },
            undefined,
            {
              positionalCount: true,
            },
          )
        : buildTFunctionCallText(params),
    interpolationWrap: { prefix: '{', suffix: '}', spacing: '' },
    pluralVar: '$count',
  },
}
