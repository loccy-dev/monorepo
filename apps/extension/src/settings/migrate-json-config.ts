// One-time migration of legacy `loccy.config.json` to `.yaml`. Structural fields that map cleanly
// onto the current module shape carry over as an explicit module override (gaps still filled by
// detection, same as a hand-authored `modules:` block); AI instructions carry over into the
// styleguide. Fields with no current equivalent (e.g. `resources.file.structure`, `ai.useCodeContext`)
// are dropped.

import * as vscode from 'vscode'
import { fileResolver } from '../helpers/file-resolver'
import { generateLoccyConfigYaml } from './generate-loccy-config-yaml'
import { loccyConfigFilename, type PartialModuleConfig } from '@repo/types/config.types'
import type { ActiveFrameworkId } from '@repo/types/framework.types'
import { resolveConfig } from '@repo/shared/core/loccy-config/loccy-config'
import { getFramework, DISABLED_FRAMEWORK_IDS } from '@repo/shared/core/registry'
import { Logger } from '../helpers/logger'
import { cfg } from '../global-config'

const jsonConfigName = 'loccy.config.json'
const DEFAULT_MODULE = 'default'

/** Fields the legacy `loccy.config.json` may carry (removed from the current schema). */
interface LegacyConfig {
  resources?: {
    paths?: {
      include?: string[]
      exclude?: string[]
    }
    file?: {
      sortKeys?: 'auto' | 'yes' | 'no'
    }
  }
  usages?: {
    paths?: {
      include?: string[]
      exclude?: string[]
    }
    tFunction?: {
      preset?: string
      customFunctionNames?: string[]
    }
    detectKeysInStrings?: boolean
  }
  ai?: {
    translations?: {
      customInstructions?: string
      customInstructionsPerLocale?: Record<string, string>
    }
    keypaths?: {
      customInstructions?: string
    }
  }
}

/** An active, non-disabled framework id, or undefined for a preset with no current equivalent (e.g. `svelte-i18n`, `none`). */
function toActiveFrameworkId(preset: string | undefined): ActiveFrameworkId | undefined {
  if (!preset || !getFramework(preset) || DISABLED_FRAMEWORK_IDS.has(preset as never)) {
    return undefined
  }
  return preset as ActiveFrameworkId
}

/** Legacy structural fields, mapped onto a module override — gaps (glob w/ >1 pattern, layout, message format) still fill from detection via `resolveConfig`. */
function legacyToPartialModule(legacy: LegacyConfig): PartialModuleConfig {
  const include = legacy.resources?.paths?.include
  const sortKeysRaw = legacy.resources?.file?.sortKeys

  return {
    framework: toActiveFrameworkId(legacy.usages?.tFunction?.preset),
    usages: {
      include: legacy.usages?.paths?.include,
      exclude: legacy.usages?.paths?.exclude,
      customTFunctions: legacy.usages?.tFunction?.customFunctionNames,
      detectKeysInStrings: legacy.usages?.detectKeysInStrings,
    },
    translations: {
      // A single glob maps directly; multiple legacy patterns have no lossless single-glob
      // equivalent, so fall back to detection instead of guessing which one wins.
      glob: include?.length === 1 ? include[0] : undefined,
      exclude: legacy.resources?.paths?.exclude,
      sortKeys: sortKeysRaw === 'yes' ? true : sortKeysRaw === 'no' ? false : undefined,
    },
  }
}

/** The legacy `loccy.config.json`, or null when absent. */
export async function findLegacyJsonConfig(): Promise<vscode.Uri | null> {
  const uris = await fileResolver.getFileUris([`**/${jsonConfigName}`])
  return uris[0] ?? null
}

/** Whether a `loccy.yaml` already exists (migration only applies to json-only projects). */
export async function hasYamlConfig(): Promise<boolean> {
  return (await fileResolver.getFileUris([`**/${loccyConfigFilename}`])).length > 0
}

async function parseLegacyJson(uri: vscode.Uri): Promise<LegacyConfig> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri)
    const content = new TextDecoder('utf-8').decode(bytes)
    // ESM-only dep: static import breaks TS1479 under extension CJS emit.
    const { default: stripJsonComments } = await import('strip-json-comments')
    return JSON.parse(stripJsonComments(content)) as LegacyConfig
  } catch (e) {
    Logger.info(`Failed to parse ${jsonConfigName}: ${e instanceof Error ? e.message : 'unknown error'}`)
    return {}
  }
}

const writeFile = (uri: vscode.Uri, content: string) =>
  vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content))

/**
 * Convert `loccy.config.json` → `loccy.yaml`, then delete the json.
 * Legacy structural fields carry over as an explicit module override (detection fills any gaps);
 * legacy AI instructions carry over as the styleguide (`global` / `locales` / `keypaths`).
 */
export async function migrateJsonConfig(jsonUri: vscode.Uri): Promise<{ migratedAiInstructions: boolean }> {
  const legacy = await parseLegacyJson(jsonUri)
  const dir = vscode.Uri.joinPath(jsonUri, '..')

  const global = legacy.ai?.translations?.customInstructions
  const locales = legacy.ai?.translations?.customInstructionsPerLocale
  const keypaths = legacy.ai?.keypaths?.customInstructions?.trim()
  const migratedAiInstructions = Boolean(global?.trim() || Object.keys(locales ?? {}).length || keypaths)

  const { modules } = resolveConfig(
    { modules: { [DEFAULT_MODULE]: legacyToPartialModule(legacy) } },
    cfg.resolvedConfig,
  )

  await writeFile(
    vscode.Uri.joinPath(dir, loccyConfigFilename),
    generateLoccyConfigYaml({ global, locales, code: keypaths }, modules),
  )

  await vscode.workspace.fs.delete(jsonUri)

  return { migratedAiInstructions }
}
