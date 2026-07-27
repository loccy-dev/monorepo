import chalk from 'chalk'
import ora from 'ora'
import { loccyConfigFilename, type LoccyConfig } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { readConfigFile, LoccyConfigError } from '@repo/shared/core/loccy-config/loccy-config'

/** One-line description of the config's modules for the load spinner. */
function describeModules(config: LoccyConfig): string {
  const modules = Object.values(config.modules)
  if (modules.length === 1) return `framework: ${modules[0]!.framework}`
  return `${modules.length} modules: ${modules.map((m) => `${m.name} (${m.framework})`).join(', ')}`
}

/** Read + resolve the config at `configPath`, or print a failure and exit(1). Shared by lint/format. */
export async function loadConfigOrExit(platform: Platform, configPath: string): Promise<LoccyConfig> {
  const spinner = ora('Reading loccy config…').start()
  let config: LoccyConfig | null = null
  try {
    config = await readConfigFile(platform, configPath)
  } catch (err) {
    spinner.fail(err instanceof LoccyConfigError ? err.message : `Invalid ${configPath}`)
    process.exit(1)
  }

  if (!config) {
    spinner.fail(`No ${configPath} found`)
    console.log(chalk.gray(`  Run ${chalk.bold('loccy help')} for setup instructions`))
    process.exit(1)
  }
  spinner.succeed(`Loaded ${configPath} (${describeModules(config)})`)
  return config
}
