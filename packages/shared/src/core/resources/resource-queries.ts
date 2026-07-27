// Pure translation-data query helpers shared between the CLI/skill resource manager and the IDE's
// resource service — both merge per-file parsers into the same `{ locale: { namespace: data } }`
// shape and need identical read-side transforms. Only transforms verified byte-identical between
// the two consumers live here; anything with consumer-specific behavior stays local to its caller.

import { get, set } from 'lodash-es'
import type { Locale, Namespace, LocalizedText, Localized } from '@repo/types/primitives.types'
import { flattenObject } from '../helpers/helpers'

export type MergedData = Record<Locale, Record<Namespace, object>>

/** { en: {my: {key: "yes"}}, de: {my: {key: "ja"}} } */
export function getTranslationsPerLocale(mergedData: MergedData, ns: Namespace): Localized<object> {
  return Object.fromEntries(Object.entries(mergedData).map(([locale, nsData]) => [locale, nsData[ns] ?? {}]))
}

/** { en: {my.key: "yes"}, de: {my.key: "ja"} } */
export function getFlatTranslationsPerLocale(mergedData: MergedData, ns: Namespace): Localized<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(mergedData).map(([locale, nsData]) => [locale, flattenObject<string>(nsData[ns] ?? {})]),
  )
}

/** { my: {key: {en: "yes", de: "ja"}} } */
export function getTranslationsPerKeypath(mergedData: MergedData, ns: Namespace): object {
  const merged = {}
  for (const [locale, nsData] of Object.entries(mergedData)) {
    const flattened = flattenObject<string>(nsData[ns] ?? {})
    Object.entries(flattened).forEach(([path, value]) => {
      const existing = get(merged, path, {})
      set(merged, path, { ...existing, [locale]: value })
    })
  }
  return merged
}

/** { "my.key": {en: "yes", de: "ja"} } */
export function getFlatTranslationsPerKeypath(
  flatTranslationsPerLocale: Localized<Record<string, string>>,
): Record<string, LocalizedText> {
  const result: Record<string, LocalizedText> = {}
  for (const [locale, translationPerKeypath] of Object.entries(flatTranslationsPerLocale)) {
    for (const [keypath, translation] of Object.entries(translationPerKeypath)) {
      if (!(keypath in result)) {
        result[keypath] = {}
      }
      result[keypath]![locale] = translation
    }
  }
  return result
}
