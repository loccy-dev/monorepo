// Platform-agnostic resource manager for i18n translation files

import { cloneDeep, capitalize, last } from 'lodash-es'
import type { I18nFrameworkId } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import type { Locale, Namespace, LocalizedText, Localized, Namespaced } from '@repo/types/primitives.types'
import type { LayoutPattern, ResolvedModule } from '@repo/types/config.types'
import { extractFileName, extractFileExt, extractDirname, computeStaticPrefix } from '../helpers/path.helpers'
import { getSortedLocales } from '../helpers/locale.helpers'
import { NS_WITHOUT_NS, qualifyKey } from '../helpers/namespace.helpers'
import { parseLayout, buildPathFromLayout } from './organization-parser'
import { getResourceFormatByExt, parseResourceFile, resolveModuleTranslations } from '../registry'
import type { ResourceDocument } from '../contracts'
import * as queries from './resource-queries'

export interface ResourceManagerConfig {
  /** Layout pattern (string, or per-locale map) */
  layout: LayoutPattern
  defaultNs: string
  sortKeys: boolean | undefined
  i18nFramework: I18nFrameworkId
  /** Glob pattern that produced the resource files — used to strip static prefix before org matching */
  globPattern?: string
}

interface FileData {
  content: string
  relativePath: string
}

export interface KeypathSuggestion {
  keypath: string
  value: string
  hasChildren: boolean
}

type FileParserMap = Map<string, { parser: ResourceDocument; locale: Locale; namespace: Namespace }>

interface ResourceCache {
  mergedPerLocale: null | Localized<Namespaced<object>>
  flatTranslationsPerLocale: Map<string, Localized<Record<string, string>>>
  translationsPerKeypath: Map<string, object>
  flatTranslationsPerKeypath: Map<string, Record<string, LocalizedText>>
}

export class ResourceManager {
  private fileParsers: FileParserMap = new Map()

  public layout: LayoutPattern
  public defaultNs: ResourceManagerConfig['defaultNs']
  public sortKeys: ResourceManagerConfig['sortKeys']
  public i18nFramework: I18nFrameworkId
  private globPrefix: string

  private _cache: ResourceCache = {
    mergedPerLocale: null,
    flatTranslationsPerLocale: new Map(),
    translationsPerKeypath: new Map(),
    flatTranslationsPerKeypath: new Map(),
  }

  constructor(config: ResourceManagerConfig, translationFiles: FileData[]) {
    this.layout = config.layout
    this.defaultNs = config.defaultNs
    this.sortKeys = config.sortKeys
    this.i18nFramework = config.i18nFramework
    this.globPrefix = config.globPattern ? computeStaticPrefix([config.globPattern]) : ''

    this.loadFiles(translationFiles)
  }

  private loadFiles(files: FileData[]): void {
    if (!files.length) {
      return
    }

    for (const file of files) {
      try {
        const format = getResourceFormatByExt(extractFileExt(file.relativePath))
        if (!format) {
          continue // unsupported resource format — skip
        }

        const content = file.content ?? ''
        const parser = parseResourceFile(format, content.trim() ? content : format.emptyContent, this.sortKeys)
        const { locale, namespace } = this.extractLocaleAndNamespace(file.relativePath)

        this.fileParsers.set(file.relativePath, {
          parser,
          locale,
          namespace,
        })
      } catch {
        // Skip unparseable files silently
      }
    }
  }

  public reloadFiles(files: FileData[]): void {
    this.clear()
    this.loadFiles(files)
  }

  private clear(): void {
    this.fileParsers.clear()
    this.invalidateCaches()
  }

  private stripGlobPrefix(filePath: string): string {
    if (this.globPrefix && filePath.startsWith(this.globPrefix + '/')) {
      return filePath.slice(this.globPrefix.length + 1)
    }
    return filePath
  }

  private extractLocaleAndNamespace(relativePath: string): {
    locale: Locale
    namespace: Namespace
  } {
    const parsed = parseLayout(this.layout, this.stripGlobPrefix(relativePath))

    if (parsed) {
      return {
        locale: parsed.locale,
        namespace: parsed.namespace ?? NS_WITHOUT_NS,
      }
    }

    // fallback: try filename as locale
    const filename = extractFileName(relativePath, false)
    return {
      locale: filename,
      namespace: NS_WITHOUT_NS,
    }
  }

  private get mergedData(): queries.MergedData {
    if (this._cache.mergedPerLocale) {
      return this._cache.mergedPerLocale
    }

    const merged: queries.MergedData = {}

    for (const [_fileUri, { parser, locale, namespace }] of this.fileParsers.entries()) {
      if (!merged[locale]) {
        merged[locale] = {}
      }

      if (!merged[locale][namespace]) {
        merged[locale][namespace] = parser.data
      } else {
        merged[locale][namespace] = this.deepMerge(merged[locale][namespace], parser.data)
      }
    }

    this._cache.mergedPerLocale = merged
    return merged
  }

  private deepMerge(target: any, source: any): any {
    if (Array.isArray(source)) {
      return source
    }

    if (typeof source !== 'object' || source === null) {
      return source
    }

    const result = { ...target }
    for (const key in source) {
      if (typeof source[key] === 'object' && !Array.isArray(source[key]) && source[key] !== null) {
        result[key] = this.deepMerge(result[key] || {}, source[key])
      } else {
        result[key] = source[key]
      }
    }
    return result
  }

  private invalidateCaches(): void {
    this._cache.mergedPerLocale = null
    this._cache.flatTranslationsPerLocale.clear()
    this._cache.translationsPerKeypath.clear()
    this._cache.flatTranslationsPerKeypath.clear()
  }

  // Public getters

  get namespaces(): Namespace[] {
    const uniqueNamespaces = new Set<string>()
    for (const [_, { namespace }] of this.fileParsers) {
      uniqueNamespaces.add(namespace)
    }
    return [...uniqueNamespaces].sort((a, b) => {
      if (a === this.defaultNs) {
        return -1
      }
      if (b === this.defaultNs) {
        return 1
      }
      return 0
    })
  }

  get allLocales(): Locale[] {
    const locales = new Set<Locale>()
    for (const [_, { locale }] of this.fileParsers) {
      locales.add(locale)
    }
    return getSortedLocales([...locales])
  }

  getResourceFileNs(relativePath: string): Namespace | null {
    const fileData = this.fileParsers.get(relativePath)
    return fileData ? fileData.namespace : null
  }

  /** { en: {my: {key: "yes"}}, de: {my: {key: "ja"}} } */
  getTranslationsPerLocale(namespace?: Namespace): Localized<object> {
    const ns = namespace ?? this.defaultNs
    return queries.getTranslationsPerLocale(this.mergedData, ns)
  }

  /** { en: {my.key: "yes"}, de: {my.key: "ja"} } */
  getFlatTranslationsPerLocale(namespace?: Namespace): Localized<Record<string, string>> {
    const ns = namespace ?? this.defaultNs
    const cached = this._cache.flatTranslationsPerLocale.get(ns)
    if (cached) {
      return cached
    }

    const result = queries.getFlatTranslationsPerLocale(this.mergedData, ns)
    this._cache.flatTranslationsPerLocale.set(ns, result)
    return result
  }

  /** { my: {key: {en: "yes", de: "ja"}} } */
  getTranslationsPerKeypath(namespace?: Namespace): object {
    const ns = namespace ?? this.defaultNs
    const cached = this._cache.translationsPerKeypath.get(ns)
    if (cached) {
      return cached
    }

    const merged = queries.getTranslationsPerKeypath(this.mergedData, ns)
    this._cache.translationsPerKeypath.set(ns, merged)
    return merged
  }

  /** { "my.key": {en: "yes", de: "ja"} } */
  getFlatTranslationsPerKeypath(namespace?: Namespace): Record<string, LocalizedText> {
    const ns = namespace ?? this.defaultNs
    const cached = this._cache.flatTranslationsPerKeypath.get(ns)
    if (cached) {
      return cached
    }

    const result = queries.getFlatTranslationsPerKeypath(this.getFlatTranslationsPerLocale(namespace))
    this._cache.flatTranslationsPerKeypath.set(ns, result)
    return result
  }

  /** { "ns:my.key": {en: "yes", de: "ja"} } */
  get mergedFlatTranslationsPerKeypath(): Record<string, LocalizedText> {
    const result: Record<string, LocalizedText> = {}
    const namespaces = this.namespaces ?? []

    for (const namespace of namespaces) {
      const flatPerLocale = this.getFlatTranslationsPerLocale(namespace)
      for (const [locale, translationPerKeypath] of Object.entries(flatPerLocale)) {
        for (const [keypath, translation] of Object.entries(translationPerKeypath)) {
          const mergedKey = qualifyKey(namespace, keypath)
          if (!(mergedKey in result)) {
            result[mergedKey] = {}
          }
          result[mergedKey]![locale] = translation
        }
      }
    }

    return result
  }

  allLocalesLocalizedText(keypath: string, namespace?: Namespace): LocalizedText {
    const existingTranslations = this.getFlatTranslationsPerKeypath(namespace)[keypath] ?? {}
    return Object.fromEntries(this.allLocales.map((l) => [l, existingTranslations[l] ?? '']))
  }

  existingTranslationsLocalizedText(keypath: string, namespace?: Namespace): LocalizedText {
    const existingTranslations = this.getFlatTranslationsPerKeypath(namespace)[keypath] ?? {}
    return Object.fromEntries(this.allLocales.map((l) => [l, existingTranslations[l]]).filter(([_k, v]) => !!v))
  }

  // Keypath autocompletion

  getKeypathSuggestions(input: string, displayLocale: Locale, namespace?: Namespace): KeypathSuggestion[] {
    const transformObjToSuggestions = (obj: object, prefix: string) => {
      const result: KeypathSuggestion[] = []
      for (const [k, v] of Object.entries(obj)) {
        result.push({
          keypath: `${prefix ? prefix + '.' : ''}${k}`,
          hasChildren: typeof Object.values(v)[0] !== 'string',
          value: this.humanizeNestedObject(v, displayLocale),
        })
      }
      return result
    }

    const parts = input.split('.')
    const partsReal: string[] = []
    let currObj = cloneDeep(this.getTranslationsPerKeypath(namespace)) as Record<string, any>

    if (!input.trim()) {
      return transformObjToSuggestions(currObj, '')
    }
    if (parts.slice(0, -1).includes('')) {
      return []
    }

    for (const [i, part] of parts.slice(0, -1).entries()) {
      if (part in currObj) {
        currObj = currObj[part]
        partsReal.push(part)
        continue
      } else {
        if (i < parts.length - 2 || input.endsWith('.')) {
          currObj = {}
          break
        }

        if (capitalize(part) in currObj) {
          currObj = currObj[capitalize(part)]
          partsReal.push(capitalize(part))
          continue
        } else if (part.toLowerCase() in currObj) {
          currObj = currObj[part.toLowerCase()]
          partsReal.push(part.toLowerCase())
          continue
        }
      }

      currObj = {}
      break
    }

    if (typeof Object.values(currObj)[0] === 'string') {
      return []
    }

    const latestPart = last(parts)!
    for (const key of Object.keys(currObj)) {
      if (!key.toLowerCase().startsWith(latestPart.toLowerCase())) {
        delete currObj[key]
      }
    }

    return transformObjToSuggestions(currObj, partsReal.join('.'))
  }

  humanizeNestedObject(rootObj: Record<string, unknown>, displayLocale: Locale): string {
    if (typeof Object.values(rootObj)[0] === 'string') {
      return (rootObj[displayLocale] as string) ?? Object.values(rootObj)[0]
    }

    const handleObj = (obj: Record<string, unknown>): Record<string, unknown> => {
      for (const [k, v] of Object.entries(obj)) {
        const nested = v as Record<string, unknown>
        if (typeof Object.values(nested)[0] === 'string') {
          obj[k] = (nested[displayLocale] as string) ?? Object.values(nested)[0]
        } else {
          handleObj(nested)
        }
      }
      return obj
    }

    const handled = handleObj(cloneDeep(rootObj))
    return stringifyAndClean(handled)
  }

  // New locale file creation

  /** File path for a new locale, derived from an existing file's path via the layout pattern (or filename fallback). */
  private deriveFilePath(existingPath: string, newLocale: Locale): string {
    const stripped = this.stripGlobPrefix(existingPath)
    const parsed = parseLayout(this.layout, stripped)
    if (parsed) {
      const built = buildPathFromLayout(this.layout, newLocale, parsed.namespace)
      return this.globPrefix ? `${this.globPrefix}/${built}` : built
    }

    // fallback: replace filename
    const dir = extractDirname(existingPath)
    const rawExt = extractFileExt(existingPath)
    const ext = rawExt ? `.${rawExt}` : '.json'
    return dir === '.' ? `${newLocale}${ext}` : `${dir}/${newLocale}${ext}`
  }

  /** File path for locale+namespace, creating a file from a reference file's formatting if missing. Null if no reference file found. */
  private ensureLocaleFile(locale: Locale, ns: Namespace): string | null {
    // check if file already exists
    for (const [filePath, fileData] of this.fileParsers.entries()) {
      if (fileData.locale === locale && fileData.namespace === ns) {
        return filePath
      }
    }

    // find a reference file for this namespace and create from it
    for (const [filePath, fileData] of this.fileParsers.entries()) {
      if (fileData.namespace === ns) {
        const derivedPath = this.deriveFilePath(filePath, locale)
        const parser = fileData.parser.cloneEmpty()
        this.fileParsers.set(derivedPath, { parser, locale, namespace: ns })
        return derivedPath
      }
    }

    return null
  }

  /** Create empty resource files for a new locale, mirroring existing file structure. */
  createLocaleFiles(newLocale: Locale): void {
    const seenNs = new Set<string>()

    for (const [filePath, fileData] of this.fileParsers.entries()) {
      if (seenNs.has(fileData.namespace)) {
        continue
      }
      seenNs.add(fileData.namespace)

      const derivedPath = this.deriveFilePath(filePath, newLocale)
      if (this.fileParsers.has(derivedPath)) {
        continue
      }

      const parser = fileData.parser.cloneEmpty()
      this.fileParsers.set(derivedPath, { parser, locale: newLocale, namespace: fileData.namespace })
    }

    this.invalidateCaches()
  }

  // Mutation helpers - return new content for the files a change actually reaches

  /**
   * Update several keypaths at once (e.g. a key-locus plural's sibling keys) across locales. Parsers
   * mutate cumulatively, so the merged file content reflects every keypath.
   */
  updateKeypaths(entries: Record<string, LocalizedText>, namespace?: Namespace): Map<string, string> {
    const result = new Map<string, string>()
    for (const [keypath, updates] of Object.entries(entries)) {
      for (const [file, content] of this.updateValue(keypath, updates, namespace)) {
        result.set(file, content)
      }
    }
    return result
  }

  /** Update value for a keypath across locales, auto-creating locale files as needed. */
  updateValue(keypath: string, updates: LocalizedText, namespace?: Namespace): Map<string, string> {
    const result = new Map<string, string>()
    const ns = namespace ?? this.defaultNs
    const fileCountBefore = this.fileParsers.size

    for (const [locale, value] of Object.entries(updates)) {
      const trimmedValue = value.trim()

      const targetFilePath = this.ensureLocaleFile(locale, ns)
      if (!targetFilePath) {
        continue
      }

      const { parser } = this.fileParsers.get(targetFilePath)!
      const before = parser.content
      parser.updateValue(keypath, trimmedValue)
      if (parser.content !== before) result.set(targetFilePath, parser.content)
    }

    if (this.fileParsers.size > fileCountBefore) {
      this.invalidateCaches()
    }

    return result
  }

  getAllFileContents(): Map<string, string> {
    const result = new Map<string, string>()
    for (const [filePath, { parser }] of this.fileParsers.entries()) {
      result.set(filePath, parser.content)
    }
    return result
  }

  getFileLocaleMap(): Map<string, { locale: Locale; namespace: Namespace }> {
    const map = new Map<string, { locale: Locale; namespace: Namespace }>()
    for (const [path, { locale, namespace }] of this.fileParsers) {
      map.set(path, { locale, namespace })
    }
    return map
  }

  /** Rename keypath across all locales in a namespace. */
  renameKeypath(oldKeypath: string, newKeypath: string, namespace?: Namespace): Map<string, string> {
    const result = new Map<string, string>()
    const ns = namespace ?? this.defaultNs

    for (const [filePath, fileData] of this.fileParsers.entries()) {
      if (fileData.namespace === ns) {
        const before = fileData.parser.content
        fileData.parser.renameKeypath(oldKeypath, newKeypath)
        if (fileData.parser.content !== before) result.set(filePath, fileData.parser.content)
      }
    }

    return result
  }
}

// Helper functions

/** Resource manager for one module's translation files, or null if none match the module's glob. */
export async function createResourceManager(
  platform: Platform,
  module: ResolvedModule,
): Promise<ResourceManager | null> {
  const { files: matchedFiles, defaultNs } = await resolveModuleTranslations(platform, module)
  if (!matchedFiles.length) {
    return null
  }

  const files = await Promise.all(
    matchedFiles.map(async (relativePath) => ({
      relativePath,
      content: await platform.readFile(relativePath),
    })),
  )

  return new ResourceManager(
    {
      layout: module.translations.layout,
      defaultNs,
      sortKeys: module.translations.sortKeys,
      i18nFramework: module.framework,
      globPattern: module.translations.glob,
    },
    files,
  )
}

function stringifyAndClean(obj: object, removeBrackets = false, removeSemicolons = false): string {
  const stringified = JSON.stringify(obj)
  let cleaned = stringified
    .replace(/\{"/g, '{')
    .replace(/,"/g, ', ')
    .replace(/":/g, removeSemicolons ? ' ' : ': ')
  if (removeBrackets) {
    cleaned = cleaned.slice(1, -1)
  }
  return cleaned
}
