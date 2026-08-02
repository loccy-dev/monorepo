import type { Loc } from './platform.types'

export type ResourceStructure = 'auto' | 'flat' | 'nested'

export interface KeypathInfo {
  loc: Loc
  content: string
  ns: string
  /** The key literal spells the namespace itself (`t('auth:login')`), so a rewrite has to keep it. */
  nsInKeypath?: boolean
  prefix?: string
  keypaths: string[]
  type: 'static' | 'dynamic-defined' | 'dynamic-undefined' | 'plurals'
  ordinal?: boolean // for plurals only — ordinal (1st, 2nd) vs cardinal (1, 2)
  module?: string
}

export interface TFunctionInfo {
  tName: string
  ns?: string
  prefix?: string
  start?: number
  end?: number
}

/** Every implemented framework id (closed set). The registry is compile-time checked against this
 * union via `satisfies Record<I18nFrameworkId, I18nFramework>`, so the two cannot drift. */
export type I18nFrameworkId = 'react-i18next' | 'vue-i18n' | 'next-intl' | 'laravel' | 'spring' | 'custom'

// Backend frameworks (`laravel`, `spring`) are temporarily withheld pending the multi-source
// storage redesign — their code stays registered and tested, just not declared or auto-detected
// (see `plans/`). Keep in sync with `I18nFrameworkId` minus `DISABLED_FRAMEWORK_IDS`.
// (Plain `//` so this rationale stays in code but out of the user-facing generated schema.)
/** Supported i18n framework id. */
export type ActiveFrameworkId = 'react-i18next' | 'vue-i18n' | 'next-intl' | 'custom'
