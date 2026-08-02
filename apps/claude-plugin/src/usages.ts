import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { findLinkedRefsInContents } from '@repo/shared/core/resources/linked-refs'
import { findUsagesByKeypath, type KeypathUsage, type QualifiedKeypath } from '@repo/shared/core/usages/find-usages'
import { loccyConfigFilename } from '@repo/types/config.types'
import { truncationLine, type ModuleContext } from './context'

const USAGE_LIMIT = 20

/**
 * A scan that ran, or the reason there is no answer. The two are never collapsed into an empty
 * result: "nothing uses this key" and "nobody looked" lead to opposite decisions about deleting it.
 */
export type UsageScan = { ok: true; usages: Map<string, KeypathUsage[]> } | { ok: false; reason: string; hint: string }

const NOT_CONFIGURED: UsageScan = {
  ok: false,
  reason: 'not scanned: usages.include is empty for this module',
  hint: `set usages.include in ${loccyConfigFilename} to the globs holding your source, so key usage can be checked`,
}

/**
 * Usages of `keys`, keyed by `qualifyKey`. A run that read no source file at all is reported as no
 * answer rather than as an empty one: globs matching nothing looks identical to a clean result, and
 * the two lead to opposite decisions about deleting a key.
 */
export async function scanUsages(ctx: ModuleContext, keys: QualifiedKeypath[]): Promise<UsageScan> {
  if (!ctx.module.usages.include.length) return NOT_CONFIGURED
  try {
    const { byKey, scannedFiles } = await findUsagesByKeypath(ctx.platform, ctx.module, keys, ctx.rm.allLocales)
    if (!scannedFiles) {
      return {
        ok: false,
        reason: `not scanned: usages.include matched no source file (${ctx.module.usages.include.join(', ')})`,
        hint: `point usages.include in ${loccyConfigFilename} at this project's source, or nothing can say what a key is used by`,
      }
    }
    return { ok: true, usages: byKey }
  } catch (err) {
    return {
      ok: false,
      reason: `scan failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      hint: 'the source globs or a source file are the likely cause; nothing here knows what uses these keys',
    }
  }
}

function usagesOf(scan: UsageScan, ns: string, keypath: string): KeypathUsage[] {
  return scan.ok ? (scan.usages.get(qualifyKey(ns, keypath)) ?? []) : []
}

/**
 * Stops a delete while something still points at the key: a source call would resolve to nothing
 * and ship a raw keypath on screen, and a linked reference in another message would render as raw
 * markup. A scan that could not run blocks the same way, since an unanswered question is not a
 * clean bill of health. `force` is for the case where the caller has already checked.
 */
export function blockIfStillUsed(
  ctx: ModuleContext,
  scan: UsageScan,
  keys: { ns: string; keypath: string }[],
  force: boolean,
): void {
  const blockers: string[] = []

  if (!scan.ok) blockers.push(`  usage ${scan.reason}`, `    ${scan.hint}`)

  for (const { ns, keypath } of keys) {
    const qualified = qualifyKey(ns, keypath)

    // Capped: a key used everywhere would answer a refusal with hundreds of lines.
    const usages = usagesOf(scan, ns, keypath)
    for (const usage of usages.slice(0, USAGE_LIMIT)) {
      blockers.push(`  ${qualified}: ${usage.file}:${usage.line}${usage.dynamic ? ' (dynamic, recheck manually)' : ''}`)
    }
    const truncated = truncationLine(usages.length, USAGE_LIMIT)
    if (truncated) blockers.push(`  ${qualified}: ${truncated}`)

    for (const file of linkedRefsTo(ctx, ns, keypath)) {
      blockers.push(`  ${qualified}: ${file} (linked reference from another message)`)
    }
  }

  if (!blockers.length) return

  // A scan that did not run cannot say the key is referenced, only that nothing can say it isn't.
  const headline = scan.ok ? 'still referenced' : 'cannot be confirmed unreferenced'

  const log = force ? console.log : console.error
  log(force ? `warning: ${headline}, removing anyway (--force)` : `error: ${headline}`)
  for (const line of blockers) log(line)

  if (force) return

  log(
    scan.ok
      ? '  removing now would leave those references resolving to nothing, printed raw on screen'
      : '  removing a key that something still calls leaves it resolving to nothing, printed raw on screen',
  )
  log('  update them first, or pass --force if they are already gone')
  process.exit(1)
}

function linkedRefsTo(ctx: ModuleContext, ns: string, keypath: string): string[] {
  return findLinkedRefsInContents(
    ctx.rm.getAllFileContents(),
    ctx.rm.getFileLocaleMap(),
    ctx.module.framework,
    keypath,
    ns,
  )
}

/** Where a key is used, or why that is unknown. Never silent: silence would read as "unused". */
export function printUsages(scan: UsageScan, ns: string, keypath: string, limit = USAGE_LIMIT): void {
  if (!scan.ok) {
    console.log(`usages: ${scan.reason}`)
    console.log(`  ${scan.hint}`)
    return
  }

  const usages = usagesOf(scan, ns, keypath)
  if (!usages.length) {
    console.log('usages: none found')
    return
  }

  console.log('usages:')
  for (const usage of usages.slice(0, limit)) {
    console.log(`  ${usage.file}:${usage.line}${usage.dynamic ? ' (dynamic, recheck manually)' : ''}`)
  }
  const truncated = truncationLine(usages.length, limit)
  if (truncated) console.log(`  ${truncated}`)
}
