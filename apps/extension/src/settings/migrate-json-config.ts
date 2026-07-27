// One-time migration of legacy `loccy.config.json` to `.yaml`. Only place json is read — structural
// config regenerates from detection (like `createConfigFile`); only AI instructions carry over into
// the styleguide.

import * as vscode from 'vscode'
import { fileResolver } from '../helpers/file-resolver'
import { generateLoccyConfigYaml } from './generate-loccy-config-yaml'
import { loccyConfigFilename } from '@repo/types/config.types'
import { Logger } from '../helpers/logger'

const jsonConfigName = 'loccy.config.json'

/** AI instruction fields the legacy `loccy.config.json` may carry (removed from the current schema). */
interface LegacyConfig {
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
 * Config is generated from current (detected) settings; the file also carries the legacy AI
 * translation instructions as the styleguide (`global` / `locales`) and keypath instructions (`keypaths`).
 */
export async function migrateJsonConfig(jsonUri: vscode.Uri): Promise<{ migratedAiInstructions: boolean }> {
  const legacy = await parseLegacyJson(jsonUri)
  const dir = vscode.Uri.joinPath(jsonUri, '..')

  const global = legacy.ai?.translations?.customInstructions
  const locales = legacy.ai?.translations?.customInstructionsPerLocale
  const keypaths = legacy.ai?.keypaths?.customInstructions?.trim()
  const migratedAiInstructions = Boolean(global?.trim() || Object.keys(locales ?? {}).length || keypaths)

  await writeFile(
    vscode.Uri.joinPath(dir, loccyConfigFilename),
    generateLoccyConfigYaml({ global, locales, code: keypaths }),
  )

  await vscode.workspace.fs.delete(jsonUri)

  return { migratedAiInstructions }
}
