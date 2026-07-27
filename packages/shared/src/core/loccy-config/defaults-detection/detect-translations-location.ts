import type { Platform } from '@repo/types/platform.types'
import { extractDirname, extractFileName } from '../../helpers/path.helpers'
import { isLocaleLike, looksLikeNamespaceStructure, looksLikeLocaleStructure } from '../../helpers/locale.helpers'
import { listResourceFormats } from '../../registry'
import { parseResourceFileSafe } from './parse-resource-file-safe'

const POPULAR_LOCALIZATION_DIRS: Record<string, number> = {
  i18n: 10,
  l10n: 9,
  locales: 9,
  locale: 8,
  translations: 8,
  lang: 7,
  languages: 6,
  intl: 6,
  messages: 5,
  localization: 5,
  resources: 4,
  translate: 4,
  assets: 3,
  strings: 3,
}

export type TranslationDirCandidate = {
  dir: string
  score: number
  paths: string[]
}

export async function detectTranslationsLocation(platform: Platform): Promise<TranslationDirCandidate[]> {
  const patterns = listResourceFormats().flatMap((format) => format.extensions.map((ext) => `**/*.${ext}`))
  const allResourceFiles = await platform.findFiles(patterns)

  const allPossibleResourceFiles = allResourceFiles.filter((filePath) => {
    return looksLikeNamespaceStructure(filePath) || looksLikeLocaleStructure(filePath)
  })

  const dirGroups: Record<string, { paths: string[] }> = {}

  for (const filePath of allPossibleResourceFiles) {
    let dir = extractDirname(filePath)

    // For namespace structure, group by parent of locale directory
    if (looksLikeNamespaceStructure(filePath)) {
      const segments = filePath.split('/')
      const localeIndex = segments.findIndex((seg) => isLocaleLike(seg))
      if (localeIndex > 0) {
        dir = segments.slice(0, localeIndex).join('/')
      }
    }

    ;(dirGroups[dir] ??= { paths: [] }).paths.push(filePath)
  }

  if (Object.keys(dirGroups).length === 0) {
    return []
  }

  const candidates: TranslationDirCandidate[] = []

  for (const [dir, { paths }] of Object.entries(dirGroups)) {
    let score = 0

    // Popular dir pattern score (0-10)
    const segments = dir.split('/')
    for (const [pattern, patternScore] of Object.entries(POPULAR_LOCALIZATION_DIRS)) {
      if (segments.includes(pattern)) {
        score += patternScore
        break
      }
    }

    // Jaccard similarity score (0-10, scaled from 0-1)
    if (paths.length >= 2) {
      const similarity = await computeJaccardSimilarity(platform, paths)
      score += similarity * 10
    }

    candidates.push({ dir, score, paths })
  }

  return candidates.sort((a, b) => b.score - a.score)
}

async function computeJaccardSimilarity(platform: Platform, paths: string[]): Promise<number> {
  const keysList: Array<Set<string>> = []
  const namespaceGroups: Record<string, string[]> = {}

  for (const filePath of paths) {
    if (looksLikeNamespaceStructure(filePath)) {
      const filename = extractFileName(filePath, true)
      if (!namespaceGroups[filename]) {
        namespaceGroups[filename] = []
      }
      namespaceGroups[filename].push(filePath)
    } else {
      keysList.push(await getJsonKeys(platform, filePath))
    }
  }

  // For namespaced files, only compare files from same namespace
  for (const namespacePaths of Object.values(namespaceGroups)) {
    if (namespacePaths.length > 1) {
      for (const filePath of namespacePaths) {
        keysList.push(await getJsonKeys(platform, filePath))
      }
      break
    }
  }

  if (keysList.length < 2) {
    return 0
  }

  // Calculate average Jaccard similarity between all pairs
  let totalSimilarity = 0
  let pairs = 0
  for (const [i, setA] of keysList.entries()) {
    for (const setB of keysList.slice(i + 1)) {
      const intersection = new Set([...setA].filter((x) => setB.has(x)))
      const union = new Set([...setA, ...setB])
      const similarity = union.size === 0 ? 0 : intersection.size / union.size
      totalSimilarity += similarity
      pairs++
    }
  }

  return pairs > 0 ? totalSimilarity / pairs : 0
}

async function getJsonKeys(platform: Platform, filePath: string): Promise<Set<string>> {
  const doc = await parseResourceFileSafe(platform, filePath)
  return new Set(doc ? Object.keys(doc.data) : [])
}
