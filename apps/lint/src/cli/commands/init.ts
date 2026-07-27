import chalk from 'chalk'
import ora from 'ora'
import { initializeConfigFiles } from '@repo/shared/core/loccy-config/initialize-config'
import { createNodePlatform } from '@repo/node-platform/index'

/**
 * Create `loccy.yaml` (auto-detected from the project): the detected mechanical config
 * written out, plus a commented `styleguide` example. Never overwrites existing files.
 */
export async function initCommand(): Promise<void> {
  const platform = createNodePlatform(process.cwd())

  const spinner = ora('Detecting project setup…').start()
  const { created, skipped, usedPlaceholder } = await initializeConfigFiles(platform)
  spinner.stop()

  for (const file of created) {
    console.log(chalk.green(`  created ${chalk.bold(file)}`))
  }
  for (const file of skipped) {
    console.log(chalk.gray(`  skipped ${file} (already exists)`))
  }

  if (usedPlaceholder) {
    console.log('')
    console.log(chalk.yellow('  Could not auto-detect your i18n setup — wrote a placeholder config.'))
    console.log(
      chalk.yellow(
        `  Edit the ${chalk.bold('default')} module (${chalk.bold('framework')}, ${chalk.bold('usages.include')}, ${chalk.bold('translations.glob')}) to match your project.`,
      ),
    )
  }
}
