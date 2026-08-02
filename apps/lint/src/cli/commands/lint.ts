import chalk from 'chalk'
import ora from 'ora'
import { loccyConfigFilename } from '@repo/types/config.types'
import { s, truncate } from '@repo/shared/core/helpers/helpers'
import { createNodePlatform } from '@repo/node-platform/index'
import type { LintFinding, LintReport } from '@repo/shared/core/lint/lint-findings'
import { runLint } from '@repo/shared/core/lint/run-lint'
import { loadConfigOrExit, selectModuleOrExit } from './load-config'

const LOCALE_COLUMN = 5

const DEBUG_LINT = process.env.LOCCY_LINT_DEBUG === '1' || process.env.LOCCY_LINT_DEBUG === 'true'

/** Which locales the run saw and which it actually checked, for diagnosing a surprising result. */
function renderDebug(report: LintReport): void {
  if (!DEBUG_LINT) return
  for (const module of report.modules) {
    console.log(chalk.gray(`  [debug] ${module.module} detectedLocales: ${module.detectedLocales.join(', ')}`))
    console.log(chalk.gray(`  [debug] ${module.module} checkLocales: ${module.checkedLocales.join(', ')}`))
  }
}

/** The per-locale breakdown under an untranslated key: what each locale says, or that it says nothing. */
function renderLocaleValues(finding: Extract<LintFinding, { rule: 'noUntranslatedKeys' }>): void {
  for (const { locale, value } of finding.locales) {
    const label = chalk.gray(`    ${locale.padEnd(LOCALE_COLUMN)} `)
    if (value === null) console.log(label + chalk.red('(missing)'))
    else if (!value.trim()) console.log(label + chalk.red('(empty)'))
    else console.log(label + chalk.white(truncate(value, 60)))
  }
}

/** One finding, coloured by how much it needs a human. */
function renderFinding(finding: LintFinding): void {
  switch (finding.kind) {
    case 'missing':
    case 'empty':
    case 'incomplete':
      console.log(
        chalk.red(`  ${chalk.bold(finding.kind)} ${finding.key}`) +
          (finding.file ? chalk.gray(`  ${finding.file}`) : ''),
      )
      renderLocaleValues(finding)
      return

    case 'plural':
      console.log(chalk.red(`  ${chalk.bold('plural')} ${finding.key}`))
      for (const { locale, missing } of finding.missingByLocale) {
        console.log(chalk.gray(`    ${locale.padEnd(LOCALE_COLUMN)} `) + chalk.red(`missing: ${missing.join(', ')}`))
      }
      return

    case 'unused':
      console.log(
        finding.removalFailed
          ? chalk.red(`  ${chalk.bold('unused')} ${finding.key}  (failed to remove, fix manually)`)
          : chalk.yellow(`  ${chalk.bold('unused')} ${finding.key}`),
      )
      return

    case 'stale-directive':
      console.log(
        chalk.yellow(`  ${chalk.bold('stale')} loccy-used-keys '${finding.pattern}' matches no key`) +
          chalk.gray(`  ${finding.location.file}:${finding.location.line}`),
      )
      return

    case 'unresolved':
      console.log(
        chalk.red(`  ${chalk.bold('missing')} ${finding.key}`) +
          chalk.gray(`  ${finding.locations.map((location) => `${location.file}:${location.line}`).join(', ')}`),
      )
      return

    case 'no-locales':
      console.log(chalk.yellow(`  ${finding.message}`))
      return

    case 'scan-failed':
    case 'io-failed':
      console.log(chalk.red(`  ${finding.message}`))
  }
}

/** The closing tally, and nothing else decides the exit code. */
function renderSummary(report: LintReport): void {
  console.log('')

  if (report.totalIssues === 0 && report.fixedCount === 0) {
    console.log(chalk.green(chalk.bold('No issues found')))
    return
  }

  if (report.fixedCount > 0) {
    console.log(chalk.green(`Fixed ${report.fixedCount} issue${s(report.fixedCount)}`))
  }
  if (report.remainingFixable > 0) {
    console.log(
      chalk.yellow(
        `${report.remainingFixable} fixable issue${s(report.remainingFixable)}, run ${chalk.bold('loccy lint --fix')}`,
      ),
    )
  }

  const manual = report.totalIssues - report.remainingFixable
  if (manual > 0) console.log(chalk.red(`${manual} issue${s(manual)} require manual fix`))
}

export async function lintCommand(options: { fix?: boolean; config?: string; module?: string }): Promise<void> {
  const platform = createNodePlatform(process.cwd())
  const loaded = await loadConfigOrExit(platform, options.config ?? loccyConfigFilename)
  const config = selectModuleOrExit(loaded, options.module)

  const extractSpinner = ora('Extracting translations…').start()
  const multiModule = Object.keys(config.modules).length > 1
  // Held in an object: assigned from a callback, which control-flow narrowing cannot follow.
  const scan: { spinner: ReturnType<typeof ora> | null } = { spinner: null }

  const report = await runLint(platform, config, options.fix ?? false, {
    onExtracted: (count) => extractSpinner.succeed(`Extracted ${count} translation${s(count)}`),
    onModuleStart: (module) => {
      scan.spinner?.stop()
      if (multiModule) {
        console.log('')
        console.log(chalk.bold.underline(`Module: ${module.name}`))
      }
      scan.spinner = ora('Scanning code for key usages…').start()
    },
  })
  scan.spinner?.stop()
  renderDebug(report)

  for (const moduleReport of report.modules) {
    if (!moduleReport.findings.length) continue
    if (multiModule) console.log(chalk.bold(`\n${moduleReport.module}`))
    for (const finding of moduleReport.findings) renderFinding(finding)
  }

  renderSummary(report)

  if (report.totalIssues > 0) process.exit(1)
}
