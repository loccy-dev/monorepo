import chalk from 'chalk'
import ora from 'ora'
import { loccyConfigFilename, type LoccyConfig } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { readConfigFile, withOnlyModule, LoccyConfigError } from '@repo/shared/core/loccy-config/loccy-config'
import { LOCCY_DOCS } from '@repo/shared/core/config'

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
  warnDroppedStyleguide(config, configPath)
  return config
}

/** Fields the schema could not take are dropped on read, so name them and point at the docs. */
function warnDroppedStyleguide(config: LoccyConfig, configPath: string): void {
  const dropped = config.droppedStyleguideFields
  if (!dropped?.length) return

  const fields = dropped.map(({ field }) => field).join(', ')
  console.log(chalk.yellow(`  ${configPath} styleguide does not match the schema, ignored: ${fields}`))
  for (const { field, reason } of dropped) {
    console.log(chalk.gray(`    ${field}: ${reason}`))
  }
  console.log(chalk.gray(`    latest schema: ${LOCCY_DOCS}/config/styleguide`))
}

/** The config scoped to `--module`, or a printed failure and exit(1) when nothing declares it. */
export function selectModuleOrExit(config: LoccyConfig, name: string | undefined): LoccyConfig {
  if (!name) return config

  const scoped = withOnlyModule(config, name)
  if (!scoped) {
    console.log(chalk.red(`No module "${name}" in this config`))
    console.log(chalk.gray(`  declared: ${Object.keys(config.modules).join(', ')}`))
    process.exit(1)
  }
  // The load line above counted every module in the file, so say which one the run narrowed to.
  console.log(chalk.gray(`  Only module: ${name}`))
  return scoped
}
