import { allSupportedLanguages } from '../config'
import { extractDirname, extractFileName } from './path.helpers'

/** Curated locale codes — covers ~99% of real-world usage without false positives. */
const COMMON_LOCALES = new Set([
  // Simple language codes (ISO 639-1)
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
  'bn',
  'pa',
  'te',
  'mr',
  'ta',
  'ur',
  'gu',
  'kn',
  'ml',
  'or',
  'tr',
  'vi',
  'th',
  'nl',
  'pl',
  'uk',
  'ro',
  'cs',
  'sv',
  'el',
  'he',
  'id',
  'ms',
  'fa',
  'hu',
  'fi',
  'da',
  'no',
  'ca',
  'sk',
  'bg',
  'hr',
  'sr',
  'lt',
  'lv',
  'et',
  'sl',
  'sq',

  // Common language-region combinations
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'en-NZ',
  'en-IN',
  'en-ZA',
  'es-ES',
  'es-MX',
  'es-AR',
  'es-CO',
  'es-CL',
  'es-419',
  'pt-BR',
  'pt-PT',
  'fr-FR',
  'fr-CA',
  'fr-BE',
  'fr-CH',
  'de-DE',
  'de-AT',
  'de-CH',
  'zh-CN',
  'zh-TW',
  'zh-HK',
  'zh-SG',
  'zh-Hans',
  'zh-Hant',
  'zh-Hans-CN',
  'zh-Hant-TW',
  'ar-SA',
  'ar-EG',
  'ar-AE',
  'it-IT',
  'it-CH',
  'nl-NL',
  'nl-BE',
  'ru-RU',
  'uk-UA',
  'ja-JP',
  'ko-KR',
  'vi-VN',
  'th-TH',
  'id-ID',
  'ms-MY',
  'tr-TR',
  'pl-PL',
  'cs-CZ',
  'ro-RO',
  'sv-SE',
  'da-DK',
  'no-NO',
  'fi-FI',
  'el-GR',
  'he-IL',
  'hu-HU',

  // Script variants
  'sr-Latn',
  'sr-Cyrl',
  'sr-Latn-RS',
  'sr-Cyrl-RS',

  // Special regions
  'en-001', // English (World)
])

const COMMON_LOCALES_UNDERSCORED = new Set(Array.from(COMMON_LOCALES).map((locale) => locale.replace('-', '_')))

const LOCALE_PATTERN = /^[a-z]{2}([-_][A-Z]{2})?$/i

/** Valid locale check: curated list first (fast, no false positives), then a restrictive regex fallback. */
export function isLocaleLike(str: string): boolean {
  if (!str || str.length < 2 || str.length > 15) {
    return false
  }

  const lowerStr = str.toLowerCase()
  for (const locale of new Set([...COMMON_LOCALES, ...COMMON_LOCALES_UNDERSCORED])) {
    if (locale.toLowerCase() === lowerStr) {
      return true
    }
  }

  // fallback
  return LOCALE_PATTERN.test(str)
}

export function getLocaleRank(localeCode: string) {
  let rank = allSupportedLanguages.findIndex((supported) => supported.code === localeCode)
  if (rank === -1) {
    rank = allSupportedLanguages.length
  }
  return rank
}

export function getSortedLocales(locales: string[]) {
  return [...locales].sort((a, b) => getLocaleRank(a) - getLocaleRank(b))
}

function classifyPathStructure(path: string): { hasLocaleLikeDir: boolean; isFilenameLocale: boolean } {
  const filename = extractFileName(path, false)
  const dirParts = extractDirname(path).split('/')

  return {
    hasLocaleLikeDir: dirParts.some((dirPart) => isLocaleLike(dirPart)),
    isFilenameLocale: isLocaleLike(filename),
  }
}

/** Namespace-based structure, e.g. /en/common.json, /zh-CN/auth.json */
export function looksLikeNamespaceStructure(path: string): boolean {
  const { hasLocaleLikeDir, isFilenameLocale } = classifyPathStructure(path)
  return hasLocaleLikeDir && !isFilenameLocale
}

/** Locale-based structure, e.g. /messages/en.json, /locales/fr.json */
export function looksLikeLocaleStructure(path: string): boolean {
  const { hasLocaleLikeDir, isFilenameLocale } = classifyPathStructure(path)
  return isFilenameLocale && !hasLocaleLikeDir
}
