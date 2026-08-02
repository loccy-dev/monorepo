import { existsSync } from 'node:fs'
import chalk from 'chalk'
import { Command } from 'commander'
import { loccyConfigFilename } from '@repo/types/config.types'
import { LOCCY_DOCS, LOCCY_SCHEMA_URL } from '@repo/shared/core/config'
import { initCommand } from './commands/init'
import { lintCommand } from './commands/lint'
import { formatCommand } from './commands/format'
import { drawHeader } from './draw-header'
import packageJson from '../../package.json'

/** Command reference, shared verbatim between the general help and the onboarding fallback. */
const HELP_BODY = `${chalk.bold('Usage')}

  ${chalk.cyan('npx loccy')} <command> [options]

${chalk.bold('Commands')}

  ${chalk.cyan('init')}          Scaffold ${loccyConfigFilename}
  ${chalk.cyan('lint')}          Lint translations and usages
  ${chalk.cyan('format')}        Sort translation files

${chalk.bold('Options')}

  -v, --version   Print version
  -h, --help      Show help ${chalk.dim('(also works per command)')}

${chalk.dim(`Docs: ${LOCCY_DOCS}/linter`)}`

/** Home output when a `loccy.yaml` already exists: the plain command reference. */
function printGeneralHelp(): void {
  drawHeader()
  console.log(`${HELP_BODY}\n`)
}

/** Prompt handed to the user's AI agent by `loccy init-prompt` */
const INIT_PROMPT = `Set up Loccy's config (i18n toolkit) in this project.
1. Read the config guide (${LOCCY_DOCS}/config), then the field reference (${LOCCY_SCHEMA_URL}).
2. If no ${loccyConfigFilename} exists, run \`loccy init\` (scaffolds from auto-detection),
   then review the generated file against this repo's real setup —
   framework, source globs, translation globs, locales.
3. Run \`loccy lint\` and read the output.
4. Clear false positives:
   - Dynamically-built keys: whitelist with a \`// loccy-used-keys: status.*\`
     comment next to where the key is built.
   - A locale whose keys are intentionally incomplete (still being filled in, or a
     regional variant inheriting from its base at runtime, e.g. de-CH on top of de):
     list the locales that must be complete in \`translations.noUntranslatedKeys\`
     (e.g. \`['en', 'de']\`), and lint checks only those.
5. Re-run \`loccy lint\` until only genuine issues remain.
6. If the generated config didn't set \`translations.sortKeys: true\`,
   ask the user whether they want keys sorted alphabetically — if yes,
   set it and run \`loccy format\`.

Note: leave the \`styleguide\` sample commented — voice, glossary and terms are a human's job.`

/** Home output when there is no config yet: onboarding. Leads with a copy-paste prompt that
 * hands the whole setup to the user's AI agent, then the manual path as a fallback. */
function printOnboarding(): void {
  drawHeader()

  console.log(`${chalk.bold('Fastest way to get started is to let your coding agent set it up:')}

  ${chalk.cyan('loccy init-prompt')} | pbcopy

Then paste into your AI agent.

——————————————————————————————————————————————

${HELP_BODY}
`)
}

/** Home output picks its mode from whether the project is already set up. */
function printHome(): void {
  if (existsSync(loccyConfigFilename)) printGeneralHelp()
  else printOnboarding()
}

const program = new Command()

program.name('loccy').version(packageJson.version, '-v, --version', 'Print version')

// root help is fully custom and identical for bare `loccy` and `loccy -h/--help`
// (`help` stays as an unlisted alias). per-command help (`loccy lint -h`) stays with commander.
const rootArg = process.argv[2]
if (!rootArg || rootArg === '-h' || rootArg === '--help' || rootArg === 'help') {
  printHome()
  process.exit(0)
}

program
  .command('init')
  .alias('init-config')
  .description('Set up Loccy: loccy.yaml + styleguide example')
  .action(async () => {
    await initCommand()
  })

program
  .command('init-prompt')
  .description('Print the AI-agent setup prompt (for piping to pbcopy)')
  .action(() => {
    console.log(INIT_PROMPT)
  })

program
  .command('lint')
  .description('Check translation files')
  .option('--fix', 'Remove unused keys')
  .option('--config <path>', `Path to config file (default: ${loccyConfigFilename})`)
  .option('--module <name>', 'Only this module')
  .action(async (options: { fix?: boolean; config?: string; module?: string }) => {
    await lintCommand(options)
  })

program
  .command('format')
  .description('Sort keys in translation files (modules with sortKeys)')
  .option('--check', 'Report unsorted files and exit non-zero; write nothing (for CI)')
  .option('--config <path>', `Path to config file (default: ${loccyConfigFilename})`)
  .option('--module <name>', 'Only this module')
  .action(async (options: { check?: boolean; config?: string; module?: string }) => {
    await formatCommand(options)
  })

program.parse(process.argv)
