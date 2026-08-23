import picomatch from 'picomatch'
import type { ResolvedModule } from '@repo/types/config.types'

const matchers = new Map<string, (relativePath: string) => boolean>()

/** Compiling a glob list costs ~20x a match, and the same few lists are reused for every file. */
function matcherFor(globs: string[]) {
  const key = globs.join('\0')
  let matcher = matchers.get(key)
  if (!matcher) {
    matcher = picomatch(globs, { dot: true })
    matchers.set(key, matcher)
  }
  return matcher
}

/**
 * Whether a root-relative path is covered by a set of globs. The single place the whole monorepo
 * answers that, so IDE, CLI and the Claude Code guard can never disagree about what a file is.
 */
export function matchesGlobs(relativePath: string, include: string[], exclude: string[] = []): boolean {
  if (exclude.length && matcherFor(exclude)(relativePath)) {
    return false
  }
  return include.length > 0 && matcherFor(include)(relativePath)
}

/** The module whose translation glob covers a resource file: first match wins, one file one module. */
export function resourceModuleName(relativePath: string, modules: ResolvedModule[]): string | undefined {
  return modules.find((module) =>
    matchesGlobs(relativePath, [module.translations.glob], module.translations.exclude ?? []),
  )?.name
}

/** Modules whose usage globs cover a source file. A repo mixing frameworks can have several. */
export function sourceModuleNames(relativePath: string, modules: ResolvedModule[]): string[] {
  return modules
    .filter((module) => matchesGlobs(relativePath, module.usages.include, module.usages.exclude ?? []))
    .map((module) => module.name)
}
