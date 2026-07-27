import type { LoccyConfig } from '@repo/types/config.types'
import { loccyConfigFilename } from '@repo/types/config.types'
import { type Platform } from '@repo/types/platform.types'
import { renderLoccyConfigYaml } from './config-templates'
import { mostCommon } from '../helpers/helpers'
import { extractFileExt } from '../helpers/path.helpers'
import { collectAllProjectDeps } from './defaults-detection/from-project-deps'
import { detectTranslationsLocation } from './defaults-detection/detect-translations-location'
import { detectResourceStructure } from './defaults-detection/detect-resource-structure'
import { detectSortKeysFromDocument } from './defaults-detection/detect-sort-keys'
import { parseResourceFileSafe } from './defaults-detection/parse-resource-file-safe'
import { buildLayout } from './layout-defaults'
import { detectFrameworkFromDeps, getFramework, getResourceFormatByExt, resolveMessageFormatId } from '../registry'

/** Scans resource files once: whether any has data, and whether all non-empty ones are key-sorted. */
async function inspectResourceFiles(
  paths: string[],
  platform: Platform,
): Promise<{ hasData: boolean; sorted: boolean }> {
  let hasData = false
  let sorted = true
  for (const filePath of paths) {
    const doc = await parseResourceFileSafe(platform, filePath)
    if (!doc) continue
    hasData = true
    if (sorted && !detectSortKeysFromDocument(doc)) {
      sorted = false
    }
  }
  return { hasData, sorted }
}

/** Most common file extension among the candidate resource files — drives the glob/layout pattern. */
function dominantExtension(paths: string[]): string {
  return mostCommon(paths.map(extractFileExt)) ?? 'json'
}

/**
 * Initialize and auto-detect config values. Returns a single `default` module (single-setup
 * auto-detection) — multi-module repos are configured explicitly.
 */
export async function initializeConfig(platform: Platform): Promise<LoccyConfig | null> {
  const allDeps = await collectAllProjectDeps(platform)

  const translationFileCandidates = await detectTranslationsLocation(platform)
  if (!translationFileCandidates.length) {
    return null
  }
  const { dir, paths } = translationFileCandidates[0]!

  // A repo with i18n resource files but no recognized framework dependency still resolves — the
  // framework falls back to `custom` (scan only `t` + configured customTFunctions). This keeps
  // auto-detection as lenient as real-world setups that use a bespoke t-function.
  const i18nFramework = detectFrameworkFromDeps(allDeps) ?? 'custom'
  const framework = getFramework(i18nFramework)
  if (!framework) {
    return null // `custom` is always registered; this only guards a bogus detected id
  }

  const filenameRepresents = detectResourceStructure(paths, i18nFramework)

  const { hasData, sorted: sortKeys } = await inspectResourceFiles(paths, platform)
  if (!hasData) {
    return null
  }

  const ext = dominantExtension(paths)
  const layout = buildLayout(filenameRepresents, ext)
  const resourceFormat = getResourceFormatByExt(ext)
  const messageFormat = resolveMessageFormatId(framework, allDeps, resourceFormat)

  return {
    modules: {
      default: {
        name: 'default',
        framework: i18nFramework,
        usages: {
          include: [framework.defaultSourceGlob],
          exclude: [],
          customTFunctions: [],
          detectKeysInStrings: true,
          noUnresolvedKeys: true,
          noUnusedKeys: true,
        },
        translations: {
          messageFormat,
          glob: dir ? `${dir}/**/*.${ext}` : `**/*.${ext}`,
          layout,
          exclude: [],
          noUntranslatedKeys: true,
          sortKeys,
        },
      },
    },
  }
}

/** Fallback when auto-detection finds nothing — framework-neutral placeholders the user adapts. */
export const placeholderConfig: LoccyConfig = {
  modules: {
    default: {
      name: 'default',
      framework: 'custom',
      usages: {
        include: ['**/*.{js,ts,jsx,tsx,vue}'],
        exclude: [],
        customTFunctions: [],
        detectKeysInStrings: true,
        noUnresolvedKeys: true,
        noUnusedKeys: true,
      },
      translations: {
        messageFormat: 'icu',
        glob: 'src/locales/**/*.json',
        layout: '{locale}.json',
        exclude: [],
        noUntranslatedKeys: true,
        sortKeys: false,
      },
    },
  },
}

export type InitConfigFilesResult = {
  /** Files written by this call. */
  created: string[]
  /** Files that already existed and were left untouched. */
  skipped: string[]
  /** True when auto-detection failed and the placeholder config was used. */
  usedPlaceholder: boolean
}

/**
 * Create `loccy.yaml` (auto-detected, placeholder on failure): the detected mechanical
 * config written out, plus a commented `styleguide` example. Existing files are never overwritten.
 */
export async function initializeConfigFiles(platform: Platform): Promise<InitConfigFilesResult> {
  const created: string[] = []
  const skipped: string[] = []
  let usedPlaceholder = false

  if (await platform.exists(loccyConfigFilename)) {
    skipped.push(loccyConfigFilename)
  } else {
    const detected = await initializeConfig(platform)
    usedPlaceholder = !detected
    await platform.writeFile(loccyConfigFilename, renderLoccyConfigYaml(detected ?? placeholderConfig))
    created.push(loccyConfigFilename)
  }

  return { created, skipped, usedPlaceholder }
}
