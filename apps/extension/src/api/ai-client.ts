import { callAiApi } from './call-ai-api'
import type { Locale, LocalizedText, Namespace } from '@repo/types/primitives.types'
import type { MessageFormatId } from '@repo/types/config.types'
import { cfg } from '../global-config'
import { getLimitedObjectStructure } from '../helpers/helpers'
import { reportEvent } from '../telemetry/telemetry'
import { TelemetryEvent } from '../telemetry/events'
import { sampleSize } from 'lodash'
import {
  AdjustAllInput,
  AdjustAllOutput,
  AdjustOneVariantsInput,
  AdjustOneVariantsOutput,
  AutoRefineInput,
  AutoRefineOutput,
  CreateKeypathInput,
  CreateKeypathOutput,
  AiAction,
  SuggestContextualTranslationInput,
  SuggestContextualTranslationOutput,
  TranslateFromOthersInput,
  TranslateFromOthersOutput,
  TranslateMultipleFromOthersInput,
  TranslateMultipleFromOthersOutput,
  TranslateSourceInput,
  TranslateSourceOutput,
  UpdateOthersInput,
  UpdateOthersOutput,
} from '@repo/types/ai-action.types'
import { SrcTextWithParams } from '../helpers/extract-params'
import { getSimilarExistingTranslations } from '../helpers/glossary'
import { resourceService } from '../helpers/resource-service'

/** Extracted params as the optional `placeholders` payload field — omitted when there are none. */
export function toPlaceholders(params: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(params).length ? params : undefined
}

class AiClient {
  /** Locales of the given module (AI translate targets), or the cross-module union when unresolved. */
  private moduleLocales(moduleName?: string): string[] {
    return (moduleName ? resourceService.view(moduleName)?.allLocales : undefined) ?? resourceService.allLocales
  }

  /** Active plural encoding for a module (or the primary view) — turns on server plural handling. */
  private messageFormatId(moduleName?: string): MessageFormatId | undefined {
    const view = (moduleName ? resourceService.view(moduleName) : undefined) ?? resourceService.primaryView()
    return view?.messageFormat.id
  }

  async translate(
    srcText: SrcTextWithParams,
    srcLocale: string,
    surroundingCode?: string,
    moduleName?: string,
    detectPlurals = false,
  ) {
    let targetLocales = this.moduleLocales(moduleName).filter((l) => l !== srcLocale)

    const payload: TranslateSourceInput = {
      srcText: srcText.value,
      placeholders: toPlaceholders(srcText.params),
      targetLocales,
      srcLocale,
      styleguide: cfg.styleguide,
      messageFormatId: detectPlurals ? this.messageFormatId(moduleName) : undefined,
    }

    const relevantTranslations = getSimilarExistingTranslations({
      srcText: srcText.value,
      similarityLocales: [srcLocale], // extraction: similarity based only on the extracted text's own locale
      outputLocales: 'ALL',
      excludeKeypath: null,
    })
    if (relevantTranslations.length) {
      payload.relevantTranslations = relevantTranslations
    }

    payload.surroundingCode = surroundingCode

    let answer = await callAiApi<TranslateSourceOutput>(AiAction.translateSource, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer!
  }

  async createKeypath(
    srcText: string,
    filePath: string,
    surroundingCode?: string,
    otherKeysInFile?: string[],
    namespace?: Namespace,
    requiredPrefix?: string,
    moduleName?: string,
  ) {
    const payload: CreateKeypathInput = {
      srcText,
      filePath,
      styleguide: cfg.styleguide,
      keypathStructure: resourceService.keypathStructure(namespace, moduleName),
      requiredPrefix,
    }

    payload.surroundingCode = surroundingCode
    payload.otherKeysInFile = otherKeysInFile
    payload.otherKeysRandom = this.getOtherKeysRandom(namespace, moduleName)
    payload.globalKeysStructure = this.getGlobalKeysStructure(namespace, moduleName)

    const response = await callAiApi<CreateKeypathOutput>(AiAction.createKeypath, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)

    let finalKeypath = response?.result?.keypath
    if (requiredPrefix && finalKeypath && !finalKeypath.startsWith(requiredPrefix + '.')) {
      finalKeypath = `${requiredPrefix}.${finalKeypath}`
    }
    return finalKeypath
  }

  async translateFromOthers(
    otherTranslations: LocalizedText,
    targetLocale: string,
    keypath: string,
    surroundingCode?: string,
  ) {
    const payload: TranslateFromOthersInput = {
      otherTranslations,
      targetLocale,
      keypath,
      styleguide: cfg.styleguide,
    }

    if (surroundingCode) {
      payload.surroundingCode = surroundingCode
    }

    let answer = await callAiApi<TranslateFromOthersOutput>(AiAction.translateFromOthers, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async translateMultipleFromOthers(
    otherTranslations: LocalizedText,
    targetLocales: string[],
    keypath: string,
    surroundingCode?: string,
  ) {
    const payload: TranslateMultipleFromOthersInput = {
      otherTranslations,
      targetLocales,
      keypath,
      styleguide: cfg.styleguide,
    }

    if (surroundingCode) {
      payload.surroundingCode = surroundingCode
    }

    let answer = await callAiApi<TranslateMultipleFromOthersOutput>(AiAction.translateMultipleFromOthers, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async updateOthers(
    srcLocale: Locale,
    srcCurrent: string,
    srcBefore: string,
    othersCurrent: LocalizedText,
    keypath: string,
    surroundingCode?: string,
  ) {
    const payload: UpdateOthersInput = {
      srcLocale,
      srcTextBefore: srcBefore,
      srcTextCurrent: srcCurrent,
      prevValues: Object.fromEntries(Object.entries(othersCurrent).filter(([, v]) => !!v)),
      targetLocales: Object.keys(othersCurrent),
      keypath,
      styleguide: cfg.styleguide,
    }

    if (surroundingCode) {
      payload.surroundingCode = surroundingCode
    }

    const answer = await callAiApi<UpdateOthersOutput>(AiAction.updateOthers, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async adjustOne(srcLocale: string, tweak: string, srcText: string) {
    const payload: AdjustOneVariantsInput = {
      srcText,
      srcLocale,
      tweak,
      styleguide: cfg.styleguide,
    }

    const answer = await callAiApi<AdjustOneVariantsOutput>(AiAction.adjustOneVariants, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async adjustAll(tweak: string, allTranslations: LocalizedText) {
    const targetLocales = Object.keys(allTranslations)

    const payload: AdjustAllInput = {
      tweak,
      allTranslations,
      targetLocales,
      styleguide: cfg.styleguide,
    }

    const answer = await callAiApi<AdjustAllOutput>(AiAction.adjustAll, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async suggestContextualTranslation(
    surroundingCode: string,
    surroundingTranslations: Record<string, LocalizedText>,
    filePath: string,
    namespace?: string,
    moduleName?: string,
  ) {
    const targetLocales = this.moduleLocales(moduleName)
    const payload: SuggestContextualTranslationInput = {
      surroundingCode,
      surroundingTranslations,
      targetLocales,
      filePath,
      styleguide: cfg.styleguide,
      keypathStructure: resourceService.keypathStructure(namespace, moduleName),
    }

    payload.otherKeysRandom = this.getOtherKeysRandom(namespace, moduleName)
    payload.globalKeysStructure = this.getGlobalKeysStructure(namespace, moduleName)

    let answer = await callAiApi<SuggestContextualTranslationOutput>(AiAction.suggestContextualTranslation, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  async autoRefine(srcLocale: Locale, srcText: string, keypath?: string, surroundingCode?: string) {
    const payload: AutoRefineInput = {
      srcLocale,
      srcText,
      keypath,
      styleguide: cfg.styleguide,
    }

    if (surroundingCode) {
      payload.surroundingCode = surroundingCode
    }

    let answer = await callAiApi<AutoRefineOutput>(AiAction.autoRefine, payload)
    reportEvent(TelemetryEvent.paidFeatureUsed)
    return answer
  }

  private getOtherKeysRandom(namespace?: Namespace, moduleName?: string): string[] | undefined {
    const keys = sampleSize(Object.keys(resourceService.getFlatTranslationsPerKeypath(namespace, moduleName)), 10)
    return keys.length > 0 ? keys : undefined
  }

  private getGlobalKeysStructure(namespace?: Namespace, moduleName?: string) {
    const structure = getLimitedObjectStructure(
      Object.values(resourceService.getTranslationsPerLocale(namespace, moduleName))[0],
      1000,
    )
    return structure && structure !== '{}' ? structure : undefined
  }

  /** Parent locale that `locale` extends, if visible; else null. */
  overrideParentFor(locale: string, visibleLocales: string[]): string | null {
    const value = cfg.styleguide?.localeRules?.[locale]
    if (!value || typeof value === 'string') {
      return null
    }
    return visibleLocales.includes(value.extends) ? value.extends : null
  }
}

export const aiClient = new AiClient()
