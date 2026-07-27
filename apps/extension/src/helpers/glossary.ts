import { stringSimilarity } from 'string-similarity-js'
import type { LocalizedText } from '@repo/types/primitives.types'
import { resourceService } from './resource-service'

type GetSimilarExistingTranslationsParams = {
  srcText: string
  excludeKeypath: string | null
  similarityLocales: string[] | 'ALL'
  outputLocales: string[] | 'ALL'
}

export function getSimilarExistingTranslations({
  srcText,
  excludeKeypath,
  similarityLocales,
  outputLocales,
}: GetSimilarExistingTranslationsParams): LocalizedText[] {
  const localesToCheckSimilarity = similarityLocales === 'ALL' ? resourceService.allLocales : similarityLocales
  const localesForResult = outputLocales === 'ALL' ? resourceService.allLocales : outputLocales

  const allTranslationsPerKeypath = resourceService.mergedFlatTranslationsPerKeypath
  const normalizedSrc = srcText.trim().toLowerCase()

  const entriesWithScores = Object.entries(allTranslationsPerKeypath)
    .filter(([k]) => k !== excludeKeypath)
    .map(([keypath, translations]) => {
      let maxScore = 0
      const relevantEntries = selectLocales(translations, localesToCheckSimilarity)

      for (const text of Object.values(relevantEntries)) {
        const normalizedText = text.trim().toLowerCase()
        const similarity = stringSimilarity(normalizedSrc, normalizedText)
        maxScore = Math.max(maxScore, similarity)
      }

      return { translations, score: maxScore }
    })

  // sort desc, keep top 5
  const topEntries = entriesWithScores
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .filter((entry) => !!entry.score)

  return topEntries
    .map((entry) => selectLocales(entry.translations, localesForResult))
    .filter((entry) => Object.keys(entry).length > 0)
}

function selectLocales(localizedText: LocalizedText, locales: string[]) {
  return Object.fromEntries(Object.entries(localizedText).filter(([k, v]) => locales.includes(k) && !!v))
}
