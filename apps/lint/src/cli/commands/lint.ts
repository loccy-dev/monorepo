import chalk from 'chalk'
import ora from 'ora'
import {
  loccyConfigFilename,
  partialOverridesOf,
  type NoUnresolvedKeysRule,
  type ResolvedModule,
} from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { createUsageScanner } from '@repo/shared/core/usages/usage-scanner'
import { isKeypathExcluded, s, truncate } from '@repo/shared/core/helpers/helpers'
import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { parseResourceFile, resolveActiveMessageFormat } from '@repo/shared/core/registry'
import { scanConfig } from '@repo/shared/core/scan/scan-config'
import { missingValuePluralCategories, requiredPluralCategories } from '@repo/shared/core/plurals/validate-plural'
import type { PluralCategory, PluralNumberType } from '@repo/types/plurals.types'
import { createNodePlatform } from '@repo/node-platform/index'
import { loadConfigOrExit } from './load-config'
import { readModuleFiles, writeModuleFile } from './module-files'

const DEBUG_LINT = process.env.LOCCY_LINT_DEBUG === '1' || process.env.LOCCY_LINT_DEBUG === 'true'

// --- Types ---

export interface TranslationEntry {
  keypath: string
  locale: string
  ns: string
  translation: string
  file: string
}

interface LintResult {
  fixable: number
  nonFixable: number
  fixed: number
}

// --- Helpers ---

/** Resolve `noUnresolvedKeys` to { enabled, excludeKeys } */
function resolveRule(rule: NoUnresolvedKeysRule | undefined): { enabled: boolean; excludeKeys: string[] } {
  if (rule === undefined || rule === true) return { enabled: true, excludeKeys: [] }
  if (rule === false) return { enabled: false, excludeKeys: [] }
  return { enabled: rule.enabled ?? true, excludeKeys: rule.excludeKeys ?? [] }
}

// --- Lint check: missing translations ---

export function checkUntranslatedKeys(
  translations: TranslationEntry[],
  module: ResolvedModule,
  partialOverrideLocales: string[],
): LintResult {
  let nonFixable = 0

  if (module.translations.noUntranslatedKeys === false) return { fixable: 0, nonFixable: 0, fixed: 0 }

  // skip partial-override locales — their empty keys are intentional (inherited from parent at runtime)
  const detectedLocales = new Set(translations.map((t) => t.locale))
  const skipLocales = new Set(partialOverrideLocales)
  const checkLocales = [...detectedLocales].filter((locale) => !skipLocales.has(locale))

  if (checkLocales.length === 0) {
    // no locales for this module (e.g. glob matches nothing) — warn and skip rather than aborting;
    // misconfigured globs also surface via the usage check
    console.log(
      chalk.yellow(`  no locales detected for module "${module.name}" — skipping (check its translations glob)`),
    )
    return { fixable: 0, nonFixable: 0, fixed: 0 }
  }

  if (DEBUG_LINT) {
    console.log(chalk.gray(`  [debug] detectedLocales: ${[...detectedLocales].sort().join(', ')}`))
    console.log(chalk.gray(`  [debug] checkLocales: ${checkLocales.join(', ')}`))
  }

  // group by ns + keypath
  const byKey = new Map<string, Map<string, string>>()
  const fileForKey = new Map<string, Map<string, string>>()

  for (const t of translations) {
    const key = `${t.ns}\0${t.keypath}`
    if (!byKey.has(key)) byKey.set(key, new Map())
    byKey.get(key)!.set(t.locale, t.translation)
    if (!fileForKey.has(key)) fileForKey.set(key, new Map())
    if (t.file) fileForKey.get(key)!.set(t.locale, t.file)
  }

  for (const [key, localeMap] of byKey) {
    const [ns, keypath] = key.split('\0')
    const fullKey = qualifyKey(ns, keypath)

    const missing: string[] = []
    const empty: string[] = []

    for (const locale of checkLocales) {
      const val = localeMap.get(locale)
      if (val === undefined) missing.push(locale)
      else if (val.trim() === '') empty.push(locale)
    }

    if (missing.length === 0 && empty.length === 0) continue

    nonFixable++
    const localeFiles = fileForKey.get(key) ?? new Map()
    // show file from first locale that has one
    const refFile = [...localeFiles.values()][0]

    const kind = missing.length > 0 && empty.length > 0 ? 'incomplete' : missing.length > 0 ? 'missing' : 'empty'
    console.log(chalk.red(`  ${chalk.bold(kind)} ${fullKey}`) + (refFile ? chalk.gray(`  ${refFile}`) : ''))
    for (const locale of [...checkLocales].sort()) {
      const val = localeMap.get(locale)
      if (val && val.trim()) {
        console.log(chalk.gray(`    ${locale.padEnd(5)} ${chalk.white(truncate(val, 60))}`))
      } else if (val !== undefined) {
        console.log(chalk.gray(`    ${locale.padEnd(5)} ${chalk.red('(empty)')}`))
      } else {
        console.log(chalk.gray(`    ${locale.padEnd(5)} ${chalk.red('(missing)')}`))
      }
    }
  }

  return { fixable: 0, nonFixable, fixed: 0 }
}

// --- Lint check: plural completeness ---

/**
 * Flag plurals that don't define every form their locale's rule requires. Value-locus formats
 * (icu/vue) validate inside each present value; key-locus (suffix-cldr) groups sibling keys
 * per base and checks the required CLDR categories exist for every locale that uses the plural.
 * Absent/empty values are left to `checkUntranslatedKeys` — this reports incompleteness only.
 */
export function checkPluralCompleteness(
  translations: TranslationEntry[],
  module: ResolvedModule,
  partialOverrideLocales: string[],
): LintResult {
  if (module.translations.checkPlurals === false) return { fixable: 0, nonFixable: 0, fixed: 0 }

  const messageFormat = resolveActiveMessageFormat(module)
  const skip = new Set(partialOverrideLocales)
  const checkLocales = [...new Set(translations.map((t) => t.locale))].filter((l) => !skip.has(l))
  if (checkLocales.length === 0) return { fixable: 0, nonFixable: 0, fixed: 0 }

  let nonFixable = 0
  const report = (fullKey: string, perLocaleMissing: Map<string, string[]>): void => {
    nonFixable++
    console.log(chalk.red(`  ${chalk.bold('plural')} ${fullKey}`))
    for (const locale of [...perLocaleMissing.keys()].sort()) {
      console.log(
        chalk.gray(`    ${locale.padEnd(5)} ${chalk.red(`missing: ${perLocaleMissing.get(locale)!.join(', ')}`)}`),
      )
    }
  }

  if (messageFormat.valueCodec) {
    // value-locus: group ns+keypath → locale → value; validate each plural value per locale.
    const byKey = new Map<string, Map<string, string>>()
    for (const t of translations) {
      const key = `${t.ns}\0${t.keypath}`
      if (!byKey.has(key)) byKey.set(key, new Map())
      byKey.get(key)!.set(t.locale, t.translation)
    }
    for (const [key, localeMap] of byKey) {
      const isPlural = [...localeMap].some(([loc, v]) => v && messageFormat.valueCodec!.parseValue(v, loc))
      if (!isPlural) continue
      const [ns, keypath] = key.split('\0')
      const fullKey = qualifyKey(ns, keypath)
      const perLocaleMissing = new Map<string, string[]>()
      for (const locale of checkLocales) {
        const val = localeMap.get(locale)
        if (!val || !val.trim()) continue // absent/empty → untranslated check
        const model = messageFormat.valueCodec!.parseValue(val, locale)
        if (!model) {
          perLocaleMissing.set(locale, ['(not a plural)'])
          continue
        }
        const missing = missingValuePluralCategories(val, locale, messageFormat, model.numberType)
        if (missing.length) perLocaleMissing.set(locale, missing)
      }
      if (perLocaleMissing.size) report(fullKey, perLocaleMissing)
    }
  } else if (messageFormat.parsePluralKey) {
    // key-locus: group sibling keys into bases; a base with ≥2 CLDR-category siblings is a plural.
    type Group = {
      numberType: PluralNumberType
      categories: Set<PluralCategory>
      presentByLocale: Map<string, Set<PluralCategory>>
    }
    const groups = new Map<string, Group>()
    for (const t of translations) {
      const parsed = messageFormat.parsePluralKey(t.keypath)
      if (!parsed) continue
      const gk = `${t.ns}\0${parsed.baseKey}\0${parsed.numberType}`
      let g = groups.get(gk)
      if (!g) {
        g = { numberType: parsed.numberType, categories: new Set(), presentByLocale: new Map() }
        groups.set(gk, g)
      }
      g.categories.add(parsed.category)
      if (t.translation?.trim() && !skip.has(t.locale)) {
        if (!g.presentByLocale.has(t.locale)) g.presentByLocale.set(t.locale, new Set())
        g.presentByLocale.get(t.locale)!.add(parsed.category)
      }
    }
    for (const [gk, g] of groups) {
      if (g.categories.size < 2) continue // not confidently a plural (avoids `step_one` false positives)
      const [ns, baseKey] = gk.split('\0')
      const fullKey = qualifyKey(ns, baseKey)
      const perLocaleMissing = new Map<string, string[]>()
      for (const [locale, present] of g.presentByLocale) {
        const missing = requiredPluralCategories(locale, messageFormat, g.numberType).filter((cat) => !present.has(cat))
        if (missing.length) perLocaleMissing.set(locale, missing)
      }
      if (perLocaleMissing.size) report(fullKey, perLocaleMissing)
    }
  }

  return { fixable: 0, nonFixable, fixed: 0 }
}

// --- Lint check: unused + missing keys ---

/**
 * Remove unused keypaths from every matching translation file. A keypath can live in several locale
 * files (e.g. `en.json` and `fr.json`), so it's only reported as removed once every file it was found
 * in was also successfully rewritten — a write failure in one file must not hide a leftover key in it.
 * Likewise, if any matching file couldn't even be read, every keypath is treated as inconclusive: an
 * unreadable file might contain it too, and there's no way to confirm it's gone everywhere.
 */
async function removeUnusedKeys(platform: Platform, module: ResolvedModule, unused: string[]): Promise<Set<string>> {
  const { files, readFailures } = await readModuleFiles(platform, module)
  const removed = new Set<string>()
  const failed = new Set<string>(readFailures > 0 ? unused : [])

  for (const { filePath, format, content } of files) {
    let doc: ReturnType<typeof parseResourceFile>
    let removedInFile: string[]
    try {
      doc = parseResourceFile(format, content)
      removedInFile = unused.filter((kp) => doc.deleteKeypath(kp) !== undefined)
      if (removedInFile.length === 0) continue
    } catch {
      continue // unparseable — skip
    }

    if (await writeModuleFile(platform, filePath, doc.content, 'remove unused keys in')) {
      for (const kp of removedInFile) removed.add(kp)
    } else {
      for (const kp of removedInFile) failed.add(kp)
    }
  }

  return new Set([...removed].filter((kp) => !failed.has(kp)))
}

export async function checkUsages(
  platform: Platform,
  module: ResolvedModule,
  translations: TranslationEntry[],
  fix: boolean,
): Promise<LintResult> {
  let nonFixable = 0
  let fixable = 0
  let fixed = 0

  if (module.usages.include.length === 0) return { fixable, nonFixable, fixed }

  const unusedEnabled = module.usages.noUnusedKeys ?? true
  const unresolvedRule = resolveRule(module.usages.noUnresolvedKeys)
  if (!unusedEnabled && !unresolvedRule.enabled) return { fixable, nonFixable, fixed }

  const translationKeypaths = new Set(translations.map((t) => t.keypath))
  const allLocales = [...new Set(translations.map((t) => t.locale))]

  try {
    const scanner = await createUsageScanner(platform, module, [...translationKeypaths], null, allLocales)
    const scanResult = await scanner.scan()

    // build keypath -> locations map and used set
    const usedKeypaths = new Set<string>()
    const keypathLocations = new Map<string, { file: string; line: number }[]>()
    for (const [file, keyInfos] of scanResult.perFile) {
      for (const info of keyInfos) {
        if (info.type !== 'static' && info.type !== 'plurals') continue
        for (const kp of info.keypaths) {
          usedKeypaths.add(kp)
          const locs = keypathLocations.get(kp) ?? []
          locs.push({ file, line: info.loc.line + 1 })
          keypathLocations.set(kp, locs)
        }
      }
    }

    if (unusedEnabled) {
      // `loccy-used-keys` directives whitelist dynamically-built keys the scanner can't see.
      const usedPatterns = scanResult.usedKeyDirectives.flatMap((d) => d.patterns)
      const unused = [...translationKeypaths].filter(
        (kp) => !usedKeypaths.has(kp) && !isKeypathExcluded(kp, usedPatterns),
      )
      if (unused.length > 0) {
        if (fix) {
          // remove unused keys from all translation files
          const removedKeys = await removeUnusedKeys(platform, module, unused)
          fixed += removedKeys.size
          if (removedKeys.size > 0) {
            console.log(
              chalk.green(`  ${chalk.bold('fixed')} removed ${removedKeys.size} unused key${s(removedKeys.size)}`),
            )
          }
          const unremoved = unused.filter((kp) => !removedKeys.has(kp))
          if (unremoved.length > 0) {
            nonFixable += unremoved.length
            for (const kp of unremoved.sort()) {
              console.log(chalk.red(`  ${chalk.bold('unused')} ${kp}  (failed to remove — fix manually)`))
            }
          }
        } else {
          fixable += unused.length
          for (const kp of unused.sort()) {
            console.log(chalk.yellow(`  ${chalk.bold('unused')} ${kp}`))
          }
        }
      }

      // Stale `loccy-used-keys` directives: a pattern matching no key means the dynamic construction
      // it guarded is gone — flag it so the comment gets removed instead of silently rotting.
      const keypaths = [...translationKeypaths]
      for (const d of scanResult.usedKeyDirectives) {
        for (const pattern of d.patterns) {
          if (keypaths.some((kp) => isKeypathExcluded(kp, [pattern]))) continue
          nonFixable++
          console.log(
            chalk.yellow(`  ${chalk.bold('stale')} loccy-used-keys '${pattern}' matches no key`) +
              chalk.gray(`  ${d.file}:${d.line + 1}`),
          )
        }
      }
    }

    if (unresolvedRule.enabled) {
      const missing = [...usedKeypaths].filter(
        (kp) => !translationKeypaths.has(kp) && !isKeypathExcluded(kp, unresolvedRule.excludeKeys),
      )
      if (missing.length > 0) {
        nonFixable += missing.length
        for (const kp of missing.sort()) {
          const locs = keypathLocations.get(kp) ?? []
          const locStr = locs.map((l) => `${l.file}:${l.line}`).join(', ')
          console.log(chalk.red(`  ${chalk.bold('missing')} ${kp}`) + chalk.gray(`  ${locStr}`))
        }
      }
    }
  } catch (err) {
    nonFixable++
    console.log(chalk.red(`  usage scanning failed: ${err instanceof Error ? err.message : 'unknown error'}`))
  }

  return { fixable, nonFixable, fixed }
}

// --- Per-module lint run ---

/** Run all enabled checks for a single module, printing its sections. */
async function lintModule(
  platform: Platform,
  module: ResolvedModule,
  entries: TranslationEntry[],
  partialOverrideLocales: string[],
  fix: boolean,
): Promise<LintResult> {
  let fixable = 0
  let nonFixable = 0
  let fixed = 0

  // Missing translations
  if (module.translations.noUntranslatedKeys !== false) {
    console.log(chalk.bold('\nMissing translations'))
    const emptyResult = checkUntranslatedKeys(entries, module, partialOverrideLocales)
    nonFixable += emptyResult.nonFixable
    if (emptyResult.nonFixable === 0) {
      console.log(chalk.green('  all translations present'))
    }
  }

  // Plural completeness — gated off until CLDR-vs-runtime category mismatch is resolved (see TODO.md).
  // eslint-disable-next-line no-constant-condition
  if (false && module.translations.checkPlurals !== false) {
    console.log(chalk.bold('\nPlural forms'))
    const pluralResult = checkPluralCompleteness(entries, module, partialOverrideLocales)
    nonFixable += pluralResult.nonFixable
    if (pluralResult.nonFixable === 0) {
      console.log(chalk.green('  all plurals complete'))
    }
  }

  // Usage checks
  if (module.usages.include.length > 0) {
    console.log(chalk.bold('\nUsage'))
    const usageSpinner = ora('Scanning code for key usages…').start()
    const usageResult = await checkUsages(platform, module, entries, fix)
    usageSpinner.stop()
    fixable += usageResult.fixable
    nonFixable += usageResult.nonFixable
    fixed += usageResult.fixed
    if (usageResult.fixable === 0 && usageResult.nonFixable === 0 && usageResult.fixed === 0) {
      console.log(chalk.green('  all keys used, none missing'))
    }
  }

  return { fixable, nonFixable, fixed }
}

// --- Summary ---

/**
 * Roll up per-module counts into the exit-code decision. `totalFixable` only ever holds unfixed-mode
 * issue counts — `checkUsages` redirects to `fixed`/`nonFixable` instead once `--fix` is passed — so
 * `totalFixed` must offset `totalFixable`, not `totalNonFixable`: fixing unused keys can never make an
 * unrelated missing-translation issue go away.
 */
export function summarizeLintResults(
  totalFixable: number,
  totalNonFixable: number,
  totalFixed: number,
): { totalIssues: number; remainingFixable: number } {
  const remainingFixable = totalFixable - totalFixed
  return { totalIssues: Math.max(0, remainingFixable) + totalNonFixable, remainingFixable }
}

// --- Main ---

export async function lintCommand(options: { fix?: boolean; config?: string }): Promise<void> {
  const fix = options.fix ?? false
  const configPath = options.config ?? loccyConfigFilename
  const platform = createNodePlatform(process.cwd())

  const config = await loadConfigOrExit(platform, configPath)

  const extractSpinner = ora('Extracting translations…').start()
  const { translations } = await scanConfig(platform, config)
  extractSpinner.succeed(`Extracted ${translations.length} translation${s(translations.length)}`)

  // group extracted rows per module (every configured module gets a bucket, even if empty)
  const entriesByModule = new Map<string, TranslationEntry[]>()
  for (const name of Object.keys(config.modules)) entriesByModule.set(name, [])
  for (const t of translations) {
    const bucket = entriesByModule.get(t.module)
    if (!bucket) continue
    bucket.push({ keypath: t.keypath, locale: t.locale, ns: t.ns, translation: t.value, file: t.translationFilepath })
  }

  const partialOverrideLocales = partialOverridesOf(config.styleguide?.locales).map((o) => o.locale)
  const modules = Object.values(config.modules)
  const multiModule = modules.length > 1

  let totalFixable = 0
  let totalNonFixable = 0
  let totalFixed = 0

  for (const module of modules) {
    if (multiModule) {
      console.log('')
      console.log(chalk.bold.underline(`Module: ${module.name}`))
    }
    const result = await lintModule(
      platform,
      module,
      entriesByModule.get(module.name) ?? [],
      partialOverrideLocales,
      fix,
    )
    totalFixable += result.fixable
    totalNonFixable += result.nonFixable
    totalFixed += result.fixed
  }

  // Summary
  console.log('')
  const { totalIssues, remainingFixable } = summarizeLintResults(totalFixable, totalNonFixable, totalFixed)
  if (totalIssues === 0 && totalFixed === 0) {
    console.log(chalk.green(chalk.bold('No issues found')))
  } else {
    if (totalFixed > 0) {
      console.log(chalk.green(`Fixed ${totalFixed} issue${s(totalFixed)}`))
    }
    if (remainingFixable > 0) {
      console.log(
        chalk.yellow(`${remainingFixable} fixable issue${s(remainingFixable)}, run ${chalk.bold('loccy lint --fix')}`),
      )
    }
    if (totalNonFixable > 0) {
      console.log(chalk.red(`${totalNonFixable} issue${s(totalNonFixable)} require manual fix`))
    }
  }

  if (totalIssues > 0) {
    process.exit(1)
  }
}
