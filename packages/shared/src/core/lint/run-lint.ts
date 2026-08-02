import {
  partialOverridesOf,
  type LoccyConfig,
  type NoUnresolvedKeysRule,
  type ResolvedModule,
} from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import type { Locale } from '@repo/types/primitives.types'
import type { PluralCategory, PluralNumberType } from '@repo/types/plurals.types'
import { isKeypathExcluded } from '../helpers/helpers'
import { qualifyKey } from '../helpers/namespace.helpers'
import { missingValuePluralCategories, requiredPluralCategories } from '../plurals/validate-plural'
import { parseResourceFile, resolveActiveMessageFormat } from '../registry'
import { readModuleFiles, writeModuleFile } from '../resources/module-files'
import { scanConfig } from '../scan/scan-config'
import { createUsageScanner } from '../usages/usage-scanner'
import {
  summarizeLint,
  type LintFinding,
  type LintReport,
  type ModuleLintReport,
  type SourceLocation,
} from './lint-findings'

/** One locale's value for one key, as the scan yielded it. */
export interface TranslationEntry {
  keypath: string
  locale: Locale
  ns: string
  translation: string
  file: string
}

/** Resolve `noUnresolvedKeys` to { enabled, excludeKeys }. */
function resolveRule(rule: NoUnresolvedKeysRule | undefined): { enabled: boolean; excludeKeys: string[] } {
  if (rule === undefined || rule === true) return { enabled: true, excludeKeys: [] }
  if (rule === false) return { enabled: false, excludeKeys: [] }
  return { enabled: rule.enabled ?? true, excludeKeys: rule.excludeKeys ?? [] }
}

/** Locales the translation checks cover: everything present except the partial overrides, whose gaps are deliberate. */
function localesToCheck(translations: TranslationEntry[], partialOverrideLocales: string[]): Locale[] {
  const skip = new Set(partialOverrideLocales)
  return [...new Set(translations.map((entry) => entry.locale))].filter((locale) => !skip.has(locale))
}

/** Group entries by namespace and keypath, keeping each locale's value and the file it came from. */
function groupByKey(
  translations: TranslationEntry[],
): Map<string, { ns: string; keypath: string; values: Map<Locale, string>; files: Map<Locale, string> }> {
  const byKey = new Map<
    string,
    { ns: string; keypath: string; values: Map<Locale, string>; files: Map<Locale, string> }
  >()

  for (const entry of translations) {
    const id = `${entry.ns}\0${entry.keypath}`
    let group = byKey.get(id)
    if (!group) {
      group = { ns: entry.ns, keypath: entry.keypath, values: new Map(), files: new Map() }
      byKey.set(id, group)
    }
    group.values.set(entry.locale, entry.translation)
    if (entry.file) group.files.set(entry.locale, entry.file)
  }

  return byKey
}

/** Keys some locale is missing or leaves empty. */
export function checkUntranslatedKeys(
  translations: TranslationEntry[],
  module: ResolvedModule,
  partialOverrideLocales: string[],
): LintFinding[] {
  if (module.translations.noUntranslatedKeys === false) return []

  const checkLocales = localesToCheck(translations, partialOverrideLocales)
  if (!checkLocales.length) {
    return [
      {
        rule: 'scan',
        kind: 'no-locales',
        module: module.name,
        message: `no locales detected for module "${module.name}" (check its translations glob)`,
        fixable: false,
      },
    ]
  }

  const findings: LintFinding[] = []

  for (const group of groupByKey(translations).values()) {
    const missing = checkLocales.filter((locale) => group.values.get(locale) === undefined)
    const empty = checkLocales.filter((locale) => group.values.get(locale)?.trim() === '')
    if (!missing.length && !empty.length) continue

    findings.push({
      rule: 'noUntranslatedKeys',
      kind: missing.length && empty.length ? 'incomplete' : missing.length ? 'missing' : 'empty',
      module: module.name,
      ns: group.ns,
      key: qualifyKey(group.ns, group.keypath),
      file: [...group.files.values()][0],
      locales: [...checkLocales].sort().map((locale) => ({ locale, value: group.values.get(locale) ?? null })),
      fixable: false,
    })
  }

  return findings
}

/**
 * Plurals that don't define every form their locale's rule requires. Value-locus formats (icu/vue)
 * validate inside each present value; key-locus (suffix-cldr) groups sibling keys per base and checks
 * the required CLDR categories exist for every locale that uses the plural. Absent/empty values are
 * left to the untranslated check: this reports incompleteness only.
 */
function checkPluralCompleteness(
  translations: TranslationEntry[],
  module: ResolvedModule,
  partialOverrideLocales: string[],
): LintFinding[] {
  if (module.translations.checkPlurals === false) return []

  const messageFormat = resolveActiveMessageFormat(module)
  const skip = new Set(partialOverrideLocales)
  const checkLocales = localesToCheck(translations, partialOverrideLocales)
  if (!checkLocales.length) return []

  const findings: LintFinding[] = []
  const report = (ns: string, key: string, perLocaleMissing: Map<Locale, string[]>): void => {
    findings.push({
      rule: 'checkPlurals',
      kind: 'plural',
      module: module.name,
      ns,
      key: qualifyKey(ns, key),
      missingByLocale: [...perLocaleMissing.keys()]
        .sort()
        .map((locale) => ({ locale, missing: perLocaleMissing.get(locale)! })),
      fixable: false,
    })
  }

  if (messageFormat.valueCodec) {
    for (const group of groupByKey(translations).values()) {
      const isPlural = [...group.values].some(
        ([locale, value]) => value && messageFormat.valueCodec!.parseValue(value, locale),
      )
      if (!isPlural) continue

      const perLocaleMissing = new Map<Locale, string[]>()
      for (const locale of checkLocales) {
        const value = group.values.get(locale)
        if (!value?.trim()) continue // absent/empty goes to the untranslated check
        const model = messageFormat.valueCodec.parseValue(value, locale)
        if (!model) {
          perLocaleMissing.set(locale, ['(not a plural)'])
          continue
        }
        const missing = missingValuePluralCategories(value, locale, messageFormat, model.numberType)
        if (missing.length) perLocaleMissing.set(locale, missing)
      }
      if (perLocaleMissing.size) report(group.ns, group.keypath, perLocaleMissing)
    }
    return findings
  }

  if (!messageFormat.parsePluralKey) return findings

  // key-locus: a base with two or more CLDR-category siblings is confidently a plural.
  interface Group {
    numberType: PluralNumberType
    categories: Set<PluralCategory>
    presentByLocale: Map<Locale, Set<PluralCategory>>
  }
  const groups = new Map<string, Group>()

  for (const entry of translations) {
    const parsed = messageFormat.parsePluralKey(entry.keypath)
    if (!parsed) continue
    const id = `${entry.ns}\0${parsed.baseKey}\0${parsed.numberType}`
    let group = groups.get(id)
    if (!group) {
      group = { numberType: parsed.numberType, categories: new Set(), presentByLocale: new Map() }
      groups.set(id, group)
    }
    group.categories.add(parsed.category)
    if (entry.translation?.trim() && !skip.has(entry.locale)) {
      if (!group.presentByLocale.has(entry.locale)) group.presentByLocale.set(entry.locale, new Set())
      group.presentByLocale.get(entry.locale)!.add(parsed.category)
    }
  }

  for (const [id, group] of groups) {
    if (group.categories.size < 2) continue
    const [ns, baseKey] = id.split('\0')
    const perLocaleMissing = new Map<Locale, string[]>()
    for (const [locale, present] of group.presentByLocale) {
      const missing = requiredPluralCategories(locale, messageFormat, group.numberType).filter(
        (category) => !present.has(category),
      )
      if (missing.length) perLocaleMissing.set(locale, missing)
    }
    if (perLocaleMissing.size) report(ns!, baseKey!, perLocaleMissing)
  }

  return findings
}

/**
 * Remove unused keypaths from every matching translation file, returning the ones confirmed gone.
 * A keypath can live in several locale files, so it counts as removed only once every file holding
 * it was rewritten: a write failure in one file must not hide a leftover key in it. A file that
 * could not even be read makes every keypath inconclusive, since it might contain them too.
 */
async function removeUnusedKeys(
  platform: Platform,
  module: ResolvedModule,
  unused: string[],
): Promise<{ removed: Set<string>; ioFindings: LintFinding[] }> {
  const { files, readFailures } = await readModuleFiles(platform, module)
  const ioFindings: LintFinding[] = readFailures.map((failure) => ({
    rule: 'scan',
    kind: 'io-failed',
    module: module.name,
    message: `failed to read ${failure.filePath}: ${failure.error}`,
    fixable: false,
  }))

  const removed = new Set<string>()
  const failed = new Set<string>(readFailures.length ? unused : [])

  for (const { filePath, format, content } of files) {
    let doc: ReturnType<typeof parseResourceFile>
    let removedInFile: string[]
    try {
      doc = parseResourceFile(format, content)
      removedInFile = unused.filter((keypath) => doc.deleteKeypath(keypath) !== undefined)
      if (!removedInFile.length) continue
    } catch {
      continue // unparseable, so nothing to rewrite
    }

    const writeFailure = await writeModuleFile(platform, filePath, doc.content)
    if (writeFailure) {
      ioFindings.push({
        rule: 'scan',
        kind: 'io-failed',
        module: module.name,
        message: `failed to remove unused keys in ${filePath}: ${writeFailure.error}`,
        fixable: false,
      })
      for (const keypath of removedInFile) failed.add(keypath)
    } else {
      for (const keypath of removedInFile) removed.add(keypath)
    }
  }

  return { removed: new Set([...removed].filter((keypath) => !failed.has(keypath))), ioFindings }
}

/** Keys the code never references, and keys the code references that no locale defines. */
export async function checkUsages(
  platform: Platform,
  module: ResolvedModule,
  translations: TranslationEntry[],
  fix: boolean,
): Promise<{ findings: LintFinding[]; fixedCount: number }> {
  if (!module.usages.include.length) return { findings: [], fixedCount: 0 }

  const unusedEnabled = module.usages.noUnusedKeys ?? true
  const unresolvedRule = resolveRule(module.usages.noUnresolvedKeys)
  if (!unusedEnabled && !unresolvedRule.enabled) return { findings: [], fixedCount: 0 }

  const translationKeypaths = new Set(translations.map((entry) => entry.keypath))
  const allLocales = [...new Set(translations.map((entry) => entry.locale))]

  const findings: LintFinding[] = []
  let fixedCount = 0

  try {
    const scanner = await createUsageScanner(platform, module, [...translationKeypaths], null, allLocales)
    const scanResult = await scanner.scan()

    const usedKeypaths = new Set<string>()
    const keypathLocations = new Map<string, SourceLocation[]>()
    for (const [file, keyInfos] of scanResult.perFile) {
      for (const info of keyInfos) {
        if (info.type !== 'static' && info.type !== 'plurals') continue
        for (const keypath of info.keypaths) {
          usedKeypaths.add(keypath)
          keypathLocations.set(keypath, [...(keypathLocations.get(keypath) ?? []), { file, line: info.loc.line + 1 }])
        }
      }
    }

    if (unusedEnabled) {
      // `loccy-used-keys` directives whitelist dynamically-built keys the scanner cannot see.
      const usedPatterns = scanResult.usedKeyDirectives.flatMap((directive) => directive.patterns)
      const unused = [...translationKeypaths]
        .filter((keypath) => !usedKeypaths.has(keypath) && !isKeypathExcluded(keypath, usedPatterns))
        .sort()

      if (unused.length && fix) {
        const { removed, ioFindings } = await removeUnusedKeys(platform, module, unused)
        findings.push(...ioFindings)
        fixedCount += removed.size
        for (const keypath of unused.filter((key) => !removed.has(key))) {
          findings.push({
            rule: 'noUnusedKeys',
            kind: 'unused',
            module: module.name,
            key: keypath,
            removalFailed: true,
            fixable: false,
          })
        }
      } else {
        for (const keypath of unused) {
          findings.push({ rule: 'noUnusedKeys', kind: 'unused', module: module.name, key: keypath, fixable: true })
        }
      }

      // A directive matching no key means the dynamic construction it guarded is gone: flag it so
      // the comment gets removed instead of silently rotting.
      const keypaths = [...translationKeypaths]
      for (const directive of scanResult.usedKeyDirectives) {
        for (const pattern of directive.patterns) {
          if (keypaths.some((keypath) => isKeypathExcluded(keypath, [pattern]))) continue
          findings.push({
            rule: 'noUnusedKeys',
            kind: 'stale-directive',
            module: module.name,
            pattern,
            location: { file: directive.file, line: directive.line + 1 },
            fixable: false,
          })
        }
      }
    }

    if (unresolvedRule.enabled) {
      const missing = [...usedKeypaths]
        .filter(
          (keypath) => !translationKeypaths.has(keypath) && !isKeypathExcluded(keypath, unresolvedRule.excludeKeys),
        )
        .sort()
      for (const keypath of missing) {
        findings.push({
          rule: 'noUnresolvedKeys',
          kind: 'unresolved',
          module: module.name,
          key: keypath,
          locations: keypathLocations.get(keypath) ?? [],
          fixable: false,
        })
      }
    }
  } catch (err) {
    findings.push({
      rule: 'scan',
      kind: 'scan-failed',
      module: module.name,
      message: `usage scanning failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      fixable: false,
    })
  }

  return { findings, fixedCount }
}

/**
 * Plural completeness is written and tested but not yet trusted: CLDR's required categories and what
 * the runtimes actually resolve disagree, so enabling it would report keys that are in fact fine.
 * A module's `checkPlurals` gates it once this flips.
 */
const PLURAL_CHECKS_ENABLED = false

/** Every enabled check for one module. */
async function lintModule(
  platform: Platform,
  module: ResolvedModule,
  translations: TranslationEntry[],
  partialOverrideLocales: string[],
  fix: boolean,
): Promise<ModuleLintReport> {
  const findings = checkUntranslatedKeys(translations, module, partialOverrideLocales)
  const plurals = PLURAL_CHECKS_ENABLED ? checkPluralCompleteness(translations, module, partialOverrideLocales) : []
  const usage = await checkUsages(platform, module, translations, fix)

  return {
    module: module.name,
    findings: [...findings, ...plurals, ...usage.findings],
    fixedCount: usage.fixedCount,
    detectedLocales: [...new Set(translations.map((entry) => entry.locale))].sort(),
    checkedLocales: localesToCheck(translations, partialOverrideLocales),
  }
}

/**
 * Progress, for a renderer that shows a run happening rather than only its result. Nothing here
 * decides how it looks: a caller with no spinners simply passes nothing.
 */
export interface LintProgress {
  onExtracted?: (translationCount: number) => void
  onModuleStart?: (module: ResolvedModule) => void
}

/**
 * A whole lint run: extract the corpus, check every configured module, and total it up. The only
 * entry point a CLI needs, so the rules never get re-implemented next to a renderer.
 */
export async function runLint(
  platform: Platform,
  config: LoccyConfig,
  fix: boolean,
  progress: LintProgress = {},
): Promise<LintReport> {
  const { translations } = await scanConfig(platform, config)
  progress.onExtracted?.(translations.length)

  // Every configured module gets a bucket, so one matching nothing still reports as such.
  const entriesByModule = new Map<string, TranslationEntry[]>()
  for (const name of Object.keys(config.modules)) entriesByModule.set(name, [])
  for (const row of translations) {
    entriesByModule.get(row.module)?.push({
      keypath: row.keypath,
      locale: row.locale,
      ns: row.ns,
      translation: row.value,
      file: row.translationFilepath,
    })
  }

  const partialOverrideLocales = partialOverridesOf(config.styleguide?.localeRules).map((override) => override.locale)
  const reports: ModuleLintReport[] = []

  for (const module of Object.values(config.modules)) {
    progress.onModuleStart?.(module)
    reports.push(
      await lintModule(platform, module, entriesByModule.get(module.name) ?? [], partialOverrideLocales, fix),
    )
  }

  return summarizeLint(reports)
}
