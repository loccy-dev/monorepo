// Wire contract for the web AI endpoint (`/api/vscode/v1/ai`).
// The client sends the raw `styleguide` config as-is; the web action decides what's relevant
// (prose scoping, override visibility, code styleguide) — see `resolveLocalizationGuidance`.

import type { LocalizedText, Locale } from './primitives.types'
import type { StyleguideConfig, MessageFormatId } from './config.types'
import type { PluralCategory } from './plurals.types'

/** A plural translated per CLDR category — the branches of one locale's plural. */
export type PluralBranches = Partial<Record<PluralCategory, string>>

export enum AiAction {
  adjustAll = 'adjustAll',
  adjustOneVariants = 'adjustOneVariants',
  autoRefine = 'autoRefine',
  createKeypath = 'createKeypath',
  suggestContextualTranslation = 'suggestContextualTranslation',
  translateFromOthers = 'translateFromOthers',
  translateMultipleFromOthers = 'translateMultipleFromOthers',
  translateSource = 'translateSource',
  updateOthers = 'updateOthers',
}

/**
 * The resolver's decision for one partial-override locale — surfaced so the client can show
 * WHY a locale was filled or left empty.
 */
export type OverrideResolution = {
  /** The partial-override locale, e.g. "de-CH". */
  locale: string
  /** Locale it extends, e.g. "de". */
  extends: string
  /** true = deviated (value is in the map); false = inherited the extended locale (no override needed). */
  deviates: boolean
}

// translateSource — brand new src text, no existing translation anywhere; translated to all target locales.
export type TranslateSourceInput = {
  srcText: string
  srcLocale: string
  targetLocales: string[]
  placeholders?: Record<string, string>
  surroundingCode?: string
  relevantTranslations?: Array<LocalizedText>
  styleguide?: StyleguideConfig
  /**
   * Active plural encoding. Its presence turns on plural handling: the server may detect the source
   * is a plural and return per-locale `plurals` instead of flat `translations`. From it the server
   * derives each locale's required CLDR categories + the count placeholder. Omit to force flat (the
   * legacy behaviour) — e.g. re-translating an existing key, where plural-ness is already fixed.
   */
  messageFormatId?: MessageFormatId
}
export type TranslateSourceOutput = {
  usageContext: string | null
  /** The source count variable/expression detected for a plural (for the inserted call). Source-level, not per-variant. */
  countExpr?: string | null
  result: {
    srcText: string
    /** Flat translation per locale. Present for non-plural results (and always when `isPlural` is false). */
    translations?: LocalizedText
    /** Set when the source was detected as a plural — `plurals` carries the per-locale forms instead. */
    isPlural?: boolean
    /** Per-locale plural branches (each locale filled to its own required categories). */
    plurals?: Record<Locale, PluralBranches>
    description: string // 0 - autofix explanation, 1+ - variants descriptions
    /** Per-variant regional-override decisions (a variant can deviate differently per its text). */
    overrideResolutions?: OverrideResolution[]
  }[]
}

// translateFromOthers — derive one target locale from an existing translation in another locale.
export type TranslateFromOthersInput = {
  otherTranslations: LocalizedText
  targetLocale: string
  keypath: string
  surroundingCode?: string
  styleguide?: StyleguideConfig
}
export type TranslateFromOthersOutput = Array<{
  text: string
  explanation?: string
}>

// translateMultipleFromOthers — same as translateFromOthers, for several target locales at once.
export type TranslateMultipleFromOthersInput = {
  otherTranslations: LocalizedText
  targetLocales: string[]
  keypath: string
  surroundingCode?: string
  styleguide?: StyleguideConfig
}
export type TranslateMultipleFromOthersOutput = LocalizedText

// createKeypath
export type CreateKeypathInput = {
  srcText: string
  filePath: string
  surroundingCode?: string
  otherKeysInFile?: string[]
  otherKeysRandom?: string[]
  globalKeysStructure?: string
  requiredPrefix?: string
  keypathStructure?: 'nested' | 'flat'
  styleguide?: StyleguideConfig
}
export type CreateKeypathOutput = {
  keypath: string
}

// updateOthers — src text changed; propagate the change to other locales' existing translations.
export type UpdateOthersInput = {
  srcLocale: string
  srcTextBefore: string
  srcTextCurrent: string
  prevValues: LocalizedText
  targetLocales: string[]
  keypath?: string
  surroundingCode?: string
  styleguide?: StyleguideConfig
}
export type UpdateOthersOutput = LocalizedText

// adjustOneVariants
export type AdjustOneVariantsInput = {
  srcLocale: string
  tweak: string
  srcText: string
  styleguide?: StyleguideConfig
}
export type AdjustOneVariantsOutput = Array<{
  text: string
  explanation?: string
}>

// adjustAll
export type AdjustAllInput = {
  tweak: string
  allTranslations: LocalizedText
  targetLocales: string[]
  styleguide?: StyleguideConfig
}
export type AdjustAllOutput = LocalizedText

// suggestContextualTranslation
export type SuggestContextualTranslationInput = {
  filePath: string
  globalKeysStructure?: string
  otherKeysRandom?: string[]
  otherKeysInFile?: string[]
  keypathStructure?: 'nested' | 'flat'
  surroundingCode: string
  surroundingTranslations: Record<string, LocalizedText>
  targetLocales: string[]
  styleguide?: StyleguideConfig
}
export type SuggestContextualTranslationOutput = Array<{
  translations: LocalizedText
  explanation?: string
  keypath: string
  overrideResolutions?: OverrideResolution[]
}>

// autoRefine
export type AutoRefineInput = {
  srcLocale: string
  srcText: string
  keypath?: string
  surroundingCode?: string
  styleguide?: StyleguideConfig
}
export type AutoRefineOutput = Array<{
  text: string
  explanation?: string
}>

/**
 * Wire response envelope for every action.
 * `overrideResolutions` left outside for simplicity.
 */
export type AiResponse<T> = {
  result: T
  overrideResolutions?: OverrideResolution[]
}

export type AiRequest =
  | { action: AiAction.adjustAll; payload: AdjustAllInput }
  | { action: AiAction.adjustOneVariants; payload: AdjustOneVariantsInput }
  | { action: AiAction.autoRefine; payload: AutoRefineInput }
  | { action: AiAction.createKeypath; payload: CreateKeypathInput }
  | { action: AiAction.suggestContextualTranslation; payload: SuggestContextualTranslationInput }
  | { action: AiAction.translateFromOthers; payload: TranslateFromOthersInput }
  | { action: AiAction.translateMultipleFromOthers; payload: TranslateMultipleFromOthersInput }
  | { action: AiAction.translateSource; payload: TranslateSourceInput }
  | { action: AiAction.updateOthers; payload: UpdateOthersInput }
