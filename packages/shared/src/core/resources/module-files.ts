import type { ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { extractFileExt } from '../helpers/path.helpers'
import { detectSortKeysFromDocument } from '../loccy-config/defaults-detection/detect-sort-keys'
import { getResourceFormatByExt, parseResourceFile } from '../registry'
import type { ResourceFormat } from '../contracts'

export interface ModuleFile {
  filePath: string
  format: ResourceFormat
  content: string
}

export interface FileFailure {
  filePath: string
  error: string
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error'
}

/**
 * Read every non-empty translation file matched by a module's glob, resolving each to its
 * resource format (files with no matching format are skipped). A `readFile` failure is reported in
 * `readFailures` rather than silently dropped — callers can't assume a keypath is absent from a file
 * they never got to look at, so they must account for the failures themselves.
 */
export async function readModuleFiles(
  platform: Platform,
  module: ResolvedModule,
): Promise<{ files: ModuleFile[]; readFailures: FileFailure[] }> {
  const filePaths = await platform.findFiles([module.translations.glob], module.translations.exclude ?? [])
  const files: ModuleFile[] = []
  const readFailures: FileFailure[] = []

  for (const filePath of filePaths) {
    const format = getResourceFormatByExt(extractFileExt(filePath))
    if (!format) continue

    try {
      const content = await platform.readFile(filePath)
      if (content.trim()) files.push({ filePath, format, content })
    } catch (err) {
      readFailures.push({ filePath, error: errorMessage(err) })
    }
  }

  return { files, readFailures }
}

/** Write `content` back to `filePath`, returning the failure instead of throwing. */
export async function writeModuleFile(
  platform: Platform,
  filePath: string,
  content: string,
): Promise<FileFailure | null> {
  try {
    await platform.writeFile(filePath, content)
    return null
  } catch (err) {
    return { filePath, error: errorMessage(err) }
  }
}

/**
 * `skipped` covers both files already in order and ones no parser could read: neither is actionable,
 * and a file that cannot be parsed must not be reported as needing a rewrite.
 */
export type SortOutcome = 'sorted' | 'needs-sort' | 'skipped' | 'failed'

export interface SortedFile {
  filePath: string
  outcome: SortOutcome
  error?: string
}

/**
 * Deep-sort the keys of a module's translation files, or with `check` report which files are out of
 * order without writing. Outcomes come back per file so each caller renders them its own way.
 */
export async function sortModuleFiles(
  platform: Platform,
  module: ResolvedModule,
  check: boolean,
): Promise<{ files: SortedFile[]; readFailures: FileFailure[] }> {
  const { files: moduleFiles, readFailures } = await readModuleFiles(platform, module)
  const files: SortedFile[] = []

  for (const { filePath, format, content } of moduleFiles) {
    try {
      if (detectSortKeysFromDocument(parseResourceFile(format, content))) {
        files.push({ filePath, outcome: 'skipped' })
        continue
      }
    } catch {
      files.push({ filePath, outcome: 'skipped' })
      continue
    }

    if (check) {
      files.push({ filePath, outcome: 'needs-sort' })
      continue
    }

    const failure = await writeModuleFile(platform, filePath, parseResourceFile(format, content, true).content)
    files.push(failure ? { filePath, outcome: 'failed', error: failure.error } : { filePath, outcome: 'sorted' })
  }

  return { files, readFailures }
}
