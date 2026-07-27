import type { I18nFrameworkId } from '@repo/types/framework.types'
import type { NamespaceOrLocale } from '@repo/types/primitives.types'
import { looksLikeLocaleStructure, looksLikeNamespaceStructure } from '../../helpers/locale.helpers'
import { getFramework } from '../../registry'

export function detectResourceStructure(allPaths: string[], preset: I18nFrameworkId): NamespaceOrLocale {
  const defaultFilenameMeaningInI18nFramework = getFramework(preset)?.defaultFilenameMeaning

  let namespaceScore = 0
  let localeScore = 0

  for (const path of allPaths) {
    // Namespace structure: /en/common.json, /i18n/fr/errors.json
    if (looksLikeNamespaceStructure(path)) {
      namespaceScore++
    }

    // Locale structure: /messages/en.json, /i18n/locales/fr.json
    if (looksLikeLocaleStructure(path)) {
      localeScore++
    }
  }

  if (namespaceScore === localeScore && defaultFilenameMeaningInI18nFramework) {
    return defaultFilenameMeaningInI18nFramework
  }

  // `locale` is the safer default if unsure, because
  // - more frameworks use it as default
  // - there is more noise in dir paths (less reliable for detection)
  return namespaceScore > localeScore ? 'namespace' : 'locale'
}
