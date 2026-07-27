import chalk from 'chalk'
import type { ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { extractFileExt } from '@repo/shared/core/helpers/path.helpers'
import { getResourceFormatByExt } from '@repo/shared/core/registry'
import type { ResourceFormat } from '@repo/shared/core/contracts'

export interface ModuleFile {
  filePath: string
  format: ResourceFormat
  content: string
}

/**
 * Read every non-empty translation file matched by a module's glob, resolving each to its format
 * resource format (files with no matching format are skipped). A `readFile` failure is logged and left out of
 * the result rather than silently dropped — callers can't assume a keypath is absent from a file they
 * never got to look at, so they must account for `readFailures` themselves.
 */
export async function readModuleFiles(
  platform: Platform,
  module: ResolvedModule,
): Promise<{ files: ModuleFile[]; readFailures: number }> {
  const filePaths = await platform.findFiles([module.translations.glob], module.translations.exclude ?? [])
  const files: ModuleFile[] = []
  let readFailures = 0

  for (const filePath of filePaths) {
    const format = getResourceFormatByExt(extractFileExt(filePath))
    if (!format) continue

    try {
      const content = await platform.readFile(filePath)
      if (content.trim()) files.push({ filePath, format, content })
    } catch (err) {
      readFailures++
      console.log(chalk.red(`  failed to read ${filePath}: ${err instanceof Error ? err.message : 'unknown error'}`))
    }
  }

  return { files, readFailures }
}

/** Write `content` back to `filePath`, logging and returning `false` instead of throwing on failure. */
export async function writeModuleFile(
  platform: Platform,
  filePath: string,
  content: string,
  action: string,
): Promise<boolean> {
  try {
    await platform.writeFile(filePath, content)
    return true
  } catch (err) {
    console.log(chalk.red(`  failed to ${action} ${filePath}: ${err instanceof Error ? err.message : 'unknown error'}`))
    return false
  }
}
