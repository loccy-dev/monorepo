import chalk from 'chalk'
import { loccyConfigFilename, type ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { s } from '@repo/shared/core/helpers/helpers'
import { detectSortKeysFromDocument } from '@repo/shared/core/loccy-config/defaults-detection/detect-sort-keys'
import { parseResourceFile } from '@repo/shared/core/registry'
import { createNodePlatform } from '@repo/node-platform/index'
import { loadConfigOrExit } from './load-config'
import { readModuleFiles, writeModuleFile } from './module-files'

interface SortResult {
  sorted: number
  needsSort: number
  failed: number
}

/** Deeply sort keys in a module's translation files. In check mode, report unsorted files without writing. */
export async function sortModuleFiles(platform: Platform, module: ResolvedModule, check: boolean): Promise<SortResult> {
  let sorted = 0
  let needsSort = 0
  const { files, readFailures } = await readModuleFiles(platform, module)
  let failed = readFailures

  for (const { filePath, format, content } of files) {
    try {
      if (detectSortKeysFromDocument(parseResourceFile(format, content))) continue // already sorted
    } catch {
      continue // skip unparseable
    }

    if (check) {
      needsSort++
      console.log(chalk.yellow(`  ${chalk.bold('needs sort')} ${filePath}`))
      continue
    }

    const sortedDoc = parseResourceFile(format, content, true)
    if (await writeModuleFile(platform, filePath, sortedDoc.content, 'sort')) {
      sorted++
      console.log(chalk.green(`  ${chalk.bold('sorted')} ${filePath}`))
    } else {
      failed++
    }
  }

  return { sorted, needsSort, failed }
}

export async function formatCommand(options: { config?: string; check?: boolean }): Promise<void> {
  const check = options.check ?? false
  const configPath = options.config ?? loccyConfigFilename
  const platform = createNodePlatform(process.cwd())
  const config = await loadConfigOrExit(platform, configPath)

  const modules = Object.values(config.modules)
  const sortable = modules.filter((m) => m.translations.sortKeys)
  const multiModule = sortable.length > 1

  if (sortable.length === 0) {
    console.log(chalk.gray('\nNothing to format — no module has `translations.sortKeys: true`.'))
    return
  }

  let totalSorted = 0
  let totalNeedsSort = 0
  let totalFailed = 0
  for (const module of sortable) {
    if (multiModule) {
      console.log('')
      console.log(chalk.bold.underline(`Module: ${module.name}`))
    }
    const result = await sortModuleFiles(platform, module, check)
    totalSorted += result.sorted
    totalNeedsSort += result.needsSort
    totalFailed += result.failed
  }

  console.log('')
  if (totalNeedsSort > 0) {
    console.log(
      chalk.red(`${totalNeedsSort} file${s(totalNeedsSort)} need sorting — run ${chalk.bold('loccy format')}`),
    )
  } else if (totalSorted > 0) {
    console.log(chalk.green(`Sorted ${totalSorted} file${s(totalSorted)}`))
  } else if (totalFailed === 0) {
    console.log(chalk.green(chalk.bold('All files already sorted')))
  }

  if (totalFailed > 0) {
    console.log(chalk.red(`${totalFailed} file${s(totalFailed)} failed to sort`))
  }
  if (totalFailed > 0 || totalNeedsSort > 0) {
    process.exit(1)
  }
}
