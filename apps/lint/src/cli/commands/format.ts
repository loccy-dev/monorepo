import chalk from 'chalk'
import { loccyConfigFilename, type ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { s } from '@repo/shared/core/helpers/helpers'
import { createNodePlatform } from '@repo/node-platform/index'
import { sortModuleFiles } from '@repo/shared/core/resources/module-files'
import { loadConfigOrExit, selectModuleOrExit } from './load-config'

interface SortResult {
  sorted: number
  needsSort: number
  failed: number
}

/** Sort a module's translation files, reporting each outcome as it goes. */
async function sortAndReport(platform: Platform, module: ResolvedModule, check: boolean): Promise<SortResult> {
  const { files, readFailures } = await sortModuleFiles(platform, module, check)
  for (const failure of readFailures) {
    console.log(chalk.red(`  failed to read ${failure.filePath}: ${failure.error}`))
  }

  const result: SortResult = { sorted: 0, needsSort: 0, failed: readFailures.length }
  for (const file of files) {
    switch (file.outcome) {
      case 'sorted':
        result.sorted++
        console.log(chalk.green(`  ${chalk.bold('sorted')} ${file.filePath}`))
        break
      case 'needs-sort':
        result.needsSort++
        console.log(chalk.yellow(`  ${chalk.bold('needs sort')} ${file.filePath}`))
        break
      case 'failed':
        result.failed++
        console.log(chalk.red(`  failed to sort ${file.filePath}: ${file.error}`))
        break
      case 'skipped':
        break
    }
  }

  return result
}

export async function formatCommand(options: { config?: string; check?: boolean; module?: string }): Promise<void> {
  const check = options.check ?? false
  const configPath = options.config ?? loccyConfigFilename
  const platform = createNodePlatform(process.cwd())
  const config = selectModuleOrExit(await loadConfigOrExit(platform, configPath), options.module)

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
    const result = await sortAndReport(platform, module, check)
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
