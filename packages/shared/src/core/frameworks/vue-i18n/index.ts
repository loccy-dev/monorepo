import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'
import { defaultVueI18nTFunctions, regexpsVueI18n } from './detection'
import type { FrameworkScanContext, I18nFramework } from '../../contracts'
import { buildTFunctionCallText } from '../common-insert'
import { runMatchPass } from '../common-scan'

async function scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]> {
  let result: KeypathInfo[] = []

  const tNames = [...new Set([...defaultVueI18nTFunctions, ...ctx.customFunctionNames])]
  result = await runMatchPass(result, content, ctx, regexpsVueI18n.tFunc(tNames), { checkNested: true })
  result = await runMatchPass(result, content, ctx, regexpsVueI18n.htmlTag, { checkNested: false })

  return result
}

export const vueI18nFramework: I18nFramework = {
  id: 'vue-i18n',
  detectFromDeps: (allDeps) => allDeps.has('vue-i18n') || allDeps.has('@nuxtjs/i18n'),
  defaultFilenameMeaning: 'locale',
  defaultSourceGlob: '**/*.{vue,js,ts,jsx,tsx}',
  detectDefaultNs: async () => NS_WITHOUT_NS,
  scanContent,
  messageFormats: ['vue-pipe', 'icu'],
  ideInsert: {
    // vue-i18n picks the plural form from a POSITIONAL count arg: `t('key', n)`, not an options object.
    insertTFunctionText: (params) => buildTFunctionCallText(params, undefined, { positionalCount: true }),
    interpolationWrap: { prefix: '{', suffix: '}', spacing: '' },
    pluralVar: 'count',
    linkedMessageUtils: {
      regex: /@:([a-zA-Z0-9_.]+)/g,
      build: (keypath) => `@:${keypath}`,
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
