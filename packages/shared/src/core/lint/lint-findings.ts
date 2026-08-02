import type { Locale, Namespace } from '@repo/types/primitives.types'

/** Rules a finding can come from, spelled as they are in `loccy.yaml`. */
type LintRule = 'noUntranslatedKeys' | 'checkPlurals' | 'noUnusedKeys' | 'noUnresolvedKeys' | 'scan'

/** One locale's side of a translation finding. `null` means the key is absent, `''` means empty. */
interface LocaleValue {
  locale: Locale
  value: string | null
}

export interface SourceLocation {
  file: string
  /** 1-based, ready to print as `file:line`. */
  line: number
}

interface FindingBase {
  rule: LintRule
  module: string
  /** Whether `--fix` can resolve it without a human deciding anything. */
  fixable: boolean
}

/**
 * Everything a lint run can report, as data. Renderers decide how it looks; nothing here knows
 * about colour, ordering or a terminal, so the same run drives the human CLI and the agent's JSON.
 */
export type LintFinding =
  | (FindingBase & {
      rule: 'noUntranslatedKeys'
      kind: 'missing' | 'empty' | 'incomplete'
      ns: Namespace
      key: string
      file?: string
      locales: LocaleValue[]
      fixable: false
    })
  | (FindingBase & {
      rule: 'checkPlurals'
      kind: 'plural'
      ns: Namespace
      key: string
      missingByLocale: { locale: Locale; missing: string[] }[]
      fixable: false
    })
  | (FindingBase & {
      rule: 'noUnusedKeys'
      kind: 'unused'
      key: string
      /** Set under `--fix`: the key was still there afterwards, so it needs a human. */
      removalFailed?: true
      fixable: boolean
    })
  | (FindingBase & {
      rule: 'noUnusedKeys'
      kind: 'stale-directive'
      pattern: string
      location: SourceLocation
      fixable: false
    })
  | (FindingBase & {
      rule: 'noUnresolvedKeys'
      kind: 'unresolved'
      key: string
      locations: SourceLocation[]
      fixable: false
    })
  | (FindingBase & { rule: 'scan'; kind: 'scan-failed' | 'no-locales' | 'io-failed'; message: string; fixable: false })

/** One module's run: what was found, what `--fix` already resolved, and what it looked at. */
export interface ModuleLintReport {
  module: string
  findings: LintFinding[]
  /** Keys `--fix` removed. They are gone, so they are not findings. */
  fixedCount: number
  /** Every locale the translation files yielded. */
  detectedLocales: Locale[]
  /** Of those, the ones the translation checks covered: partial overrides are excluded. */
  checkedLocales: Locale[]
}

export interface LintReport {
  modules: ModuleLintReport[]
  /** Findings still outstanding across every module. Non-zero means a non-zero exit. */
  totalIssues: number
  /** Of those, the ones `--fix` would resolve. */
  remainingFixable: number
  fixedCount: number
}

/** Roll per-module reports into the totals the exit code is decided from. */
export function summarizeLint(modules: ModuleLintReport[]): LintReport {
  const findings = modules.flatMap((report) => report.findings)
  return {
    modules,
    totalIssues: findings.length,
    remainingFixable: findings.filter((finding) => finding.fixable).length,
    fixedCount: modules.reduce((total, report) => total + report.fixedCount, 0),
  }
}
