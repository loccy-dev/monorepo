import type { LoccyConfig, ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { createResourceManager } from '../resources/resource-manager'
import { createUsageScanner, type ScanResult } from '../usages/usage-scanner'
import { createSignature, extractCodeContext } from '../usages/usages.helpers'
import { SURROUNDING_CODE_AI_CONTEXT_LEN } from '../config'

/**
 * Canonical per-translation row produced by a repo scan.
 * Path fields use camelCase; DB adapters map to snake_case as needed.
 */
interface ScannedTranslation {
  /** Module this row belongs to (config `modules` key). */
  module: string
  /** Repo-relative resource file containing this translation. */
  translationFilepath: string
  /** Namespace (`_` sentinel for resources with no explicit namespace). */
  ns: string
  locale: string
  keypath: string
  value: string
}

interface ScannedUsage {
  /** Module this usage belongs to (config `modules` key). */
  module: string
  keypath: string
  ns: string
  filename: string
  lineIndex: number
  startIndex: number
  endIndex: number
  hash: string
}

export interface ScanConfigResult {
  translations: ScannedTranslation[]
  usages: ScannedUsage[]
  locales: string[]
  /** filePath → { locale, namespace } for every resource file found in the scan. */
  fileLocaleMap: Map<string, { locale: string; namespace: string | null }>
  /** filePath → raw content for all resource files read during the scan. */
  fileContents: Map<string, string>
}

/**
 * Full repo scan: extracts translations + usages per module, then aggregates. Each module
 * keeps its own keypath space, so missing/unused diffs never leak across modules.
 */
export async function scanConfig(platform: Platform, config: LoccyConfig): Promise<ScanConfigResult> {
  const translations: ScannedTranslation[] = []
  const usages: ScannedUsage[] = []
  const allLocales = new Set<string>()
  const fileLocaleMap = new Map<string, { locale: string; namespace: string | null }>()
  const fileContents = new Map<string, string>()

  for (const module of Object.values(config.modules)) {
    const result = await scanModule(platform, module)
    translations.push(...result.translations)
    usages.push(...result.usages)
    result.locales.forEach((l) => allLocales.add(l))
    for (const [filePath, info] of result.fileLocaleMap) fileLocaleMap.set(filePath, info)
    for (const [filePath, content] of result.fileContents) fileContents.set(filePath, content)
  }

  return {
    translations,
    usages,
    locales: [...allLocales],
    fileLocaleMap,
    fileContents,
  }
}

/** Scan a single module — its resources + its source usages against its own keypath space. */
async function scanModule(platform: Platform, module: ResolvedModule): Promise<ScanConfigResult> {
  const translations: ScannedTranslation[] = []
  const usages: ScannedUsage[] = []
  const allLocales = new Set<string>()
  const fileLocaleMap = new Map<string, { locale: string; namespace: string | null }>()
  const fileContents = new Map<string, string>()

  const rm = await createResourceManager(platform, module)

  if (rm) {
    const fileByLocaleAndNs = new Map<string, string>()
    for (const [filePath, info] of rm.getFileLocaleMap()) {
      fileLocaleMap.set(filePath, info)
      allLocales.add(info.locale)
      fileByLocaleAndNs.set(`${info.locale}\0${info.namespace}`, filePath)
    }
    for (const [filePath, content] of rm.getAllFileContents()) {
      fileContents.set(filePath, content)
    }

    for (const namespace of rm.namespaces) {
      const flatPerLocale = rm.getFlatTranslationsPerLocale(namespace)
      for (const [locale, flat] of Object.entries(flatPerLocale)) {
        const localeFile = fileByLocaleAndNs.get(`${locale}\0${namespace}`) ?? ''
        for (const [keypath, value] of Object.entries(flat)) {
          if (keypath === '$schema') continue
          translations.push({
            module: module.name,
            translationFilepath: localeFile,
            ns: namespace,
            locale,
            keypath,
            value,
          })
        }
      }
    }
  }

  // usages (best-effort; failures don't fail the scan)
  const keypaths = [...new Set(translations.map((t) => t.keypath))]
  try {
    const scanner = await createUsageScanner(platform, module, keypaths, null, rm?.allLocales ?? [])
    const result = await scanner.scan()
    const scanned = await scanResultToScannedUsages(platform, result, fileContents, module.name)
    usages.push(...scanned)
  } catch {
    // best-effort — swallow
  }

  return {
    translations,
    usages,
    locales: [...allLocales],
    fileLocaleMap,
    fileContents,
  }
}

/** Convert raw scanner output into canonical `ScannedUsage` rows (with stable signature hashes). */
async function scanResultToScannedUsages(
  platform: Platform,
  scanResult: ScanResult,
  fileContents: Map<string, string>,
  module: string,
): Promise<ScannedUsage[]> {
  const out: ScannedUsage[] = []

  for (const [file, keyInfos] of scanResult.perFile) {
    if (!fileContents.has(file)) {
      try {
        fileContents.set(file, await platform.readFile(file))
      } catch {
        fileContents.set(file, '')
      }
    }
    const content = fileContents.get(file)!

    for (const info of keyInfos) {
      if (info.type !== 'static' && info.type !== 'plurals') continue
      const signature =
        extractCodeContext(content, info.loc.start, info.loc.end, {
          charsCount: SURROUNDING_CODE_AI_CONTEXT_LEN,
          ignoreSpaces: true,
        }) ?? ''
      const hash = signature ? createSignature(signature) : 'unknown'

      for (const keypath of info.keypaths) {
        out.push({
          module,
          keypath,
          ns: info.ns,
          filename: file,
          lineIndex: info.loc.line,
          startIndex: info.loc.start,
          endIndex: info.loc.end,
          hash,
        })
      }
    }
  }
  return out
}
