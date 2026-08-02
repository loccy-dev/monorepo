import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { rewriteLinkedRefsInContents } from '@repo/shared/core/resources/linked-refs'
import { rewriteUsagesInSource, type UsageRename } from '@repo/shared/core/usages/rename-usage'
import type { KeypathUsage } from '@repo/shared/core/usages/find-usages'
import {
  fail,
  loadModuleContext,
  requireKeypath,
  resolveNamespace,
  type KeyOptions,
  type ModuleContext,
} from '../context'
import { failOnStructuralCollision } from '../keypath-guards'
import { readStdin } from '../stdin'
import { scanUsages, type UsageScan } from '../usages'
import { writeAllOrNothing } from '../write'

/** One rename: the key as it stands and the key it becomes, always in the same namespace. */
interface Rename {
  ns: string
  from: string
  to: string
}

/** The renames to run: `{ old: new }` on stdin, one pair in it or many. */
function parseRenames(ctx: ModuleContext, raw: string, options: KeyOptions): { ns: string; renames: Rename[] } {
  if (!raw.trim()) {
    fail(
      'error: nothing to rename',
      `  loccy-tool rename-key <<'EOF'`,
      '  {"login.title":"login.heading","login.ok":"login.confirm"}',
      '  EOF',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    fail('error: invalid JSON on stdin:', raw)
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('error: expected a JSON object of { "old.key": "new.key" } on stdin')
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
  if (!entries.length) fail('error: the batch on stdin is empty')

  const ns = resolveNamespace(ctx, options)
  const renames = entries.map(([from, to]) => {
    if (typeof to !== 'string') fail(`error: ${from} must map to the new key as a string`)
    return toRename(ctx, ns, from, to)
  })
  return { ns, renames }
}

/** A rename within `ns`, which is the call's namespace: a rename never moves a key between them. */
function toRename(ctx: ModuleContext, ns: string, oldKey: string, newKey: string): Rename {
  const from = requireKeypath(oldKey)
  const to = requireKeypath(newKey)

  if (!Object.values(ctx.rm.getFlatTranslationsPerLocale(ns)).some((flat) => from in flat)) {
    fail(`error: "${from}" not found in namespace "${ns}"`)
  }
  return { ns, from, to }
}

/**
 * Renames whose target is already taken. The parsers leave an occupied keypath alone, so this would
 * otherwise report a rename that silently did nothing, and a caller that meant to merge the two
 * messages has to say so with the commands that write and delete.
 */
function failOnOccupiedTargets(ctx: ModuleContext, renames: Rename[]): void {
  const problems: string[] = []

  for (const { ns, from, to } of renames) {
    const occupied = Object.values(ctx.rm.getFlatTranslationsPerLocale(ns)).some((flat) => to in flat)
    if (occupied) {
      problems.push(
        `error: ${qualifyKey(ns, to)} already exists, so renaming ${qualifyKey(ns, from)} onto it would drop one of the two`,
        `  pick a free key, or merge them deliberately: upsert-message ${qualifyKey(ns, to)}, then remove-message ${qualifyKey(ns, from)}`,
      )
    }
  }

  const targets = renames.map(({ ns, to }) => qualifyKey(ns, to))
  const collided = [...new Set(targets.filter((target, index) => targets.indexOf(target) !== index))]
  if (collided.length) {
    problems.push(`error: this batch renames more than one key onto: ${collided.join(', ')}`)
  }

  if (problems.length) fail(...problems)
}

/**
 * Rename keys across every locale file, then rewrite the static `t('old.key')` call sites.
 * Keys built at runtime can't be matched reliably, so those are reported for a manual recheck.
 */
export async function renameKeyCommand(options: KeyOptions): Promise<void> {
  const raw = await readStdin()
  const ctx = await loadModuleContext(options)
  const { ns, renames } = parseRenames(ctx, raw, options)

  failOnOccupiedTargets(ctx, renames)
  failOnStructuralCollision(
    ctx,
    ns,
    renames.map(({ to }) => to),
    renames.map(({ from }) => from),
  )

  // Collected before the rename, while the call sites still spell the old keys.
  const scan = await scanUsages(
    ctx,
    renames.map(({ ns, from }) => ({ ns, keypath: from })),
  )

  const changed = new Map<string, string>()
  for (const { from, to } of renames) {
    for (const [filePath, content] of ctx.rm.renameKeypath(from, to, ns)) changed.set(filePath, content)
  }

  // A key is also reachable as `@:old.key`, in the serialized text the parser does not track. Run
  // after every rename, not between them: interleaved, each would undo the other's last file.
  const linked = new Map<string, string>()
  for (const { from, to } of renames) {
    const contents = new Map([...ctx.rm.getAllFileContents(), ...linked])
    for (const [filePath, content] of rewriteLinkedRefsInContents(
      contents,
      ctx.rm.getFileLocaleMap(),
      ctx.module.framework,
      from,
      to,
      ns,
    )) {
      linked.set(filePath, content)
      changed.set(filePath, content)
    }
  }

  const sources = scan.ok ? await rewriteCallSites(ctx, scan, renames) : new Map<string, string>()
  for (const [filePath, content] of sources) changed.set(filePath, content)

  await writeAllOrNothing(ctx.platform, changed)

  for (const { ns, from, to } of renames) {
    console.log(`renamed: ${qualifyKey(ns, from)} -> ${qualifyKey(ns, to)}`)
  }
  console.log(`files: ${[...changed.keys()].join(', ')}`)
  if (linked.size) console.log(`linked references rewritten in: ${[...linked.keys()].join(', ')}`)

  reportCallSites(scan, renames, sources)
}

/** New content for every source file holding a static call site of a renamed key. */
async function rewriteCallSites(
  ctx: ModuleContext,
  scan: UsageScan & { ok: true },
  renames: Rename[],
): Promise<Map<string, string>> {
  const perFile = new Map<string, UsageRename[]>()

  for (const { ns, from, to } of renames) {
    const usages = scan.usages.get(qualifyKey(ns, from)) ?? []
    for (const usage of usages) {
      if (usage.dynamic) continue
      const forFile = perFile.get(usage.file) ?? []
      const existing = forFile.find((rename) => rename.newKeypath === to)
      if (existing) existing.usages.push(usage.info)
      else forFile.push({ usages: [usage.info], newKeypath: to })
      perFile.set(usage.file, forFile)
    }
  }

  const rewritten = new Map<string, string>()
  for (const [file, renamesInFile] of perFile) {
    rewritten.set(file, rewriteUsagesInSource(await ctx.platform.readFile(file), renamesInFile))
  }
  return rewritten
}

/** What happened to the call sites, including the ones no scan can speak for. */
function reportCallSites(scan: UsageScan, renames: Rename[], rewritten: Map<string, string>): void {
  if (!scan.ok) {
    console.log(`\ncall sites: ${scan.reason}`)
    console.log(`  ${scan.hint}`)
    console.log('  nothing in the source was rewritten, so every reference to the old keys needs updating by hand')
    return
  }

  if (rewritten.size) console.log(`\nrewritten usages in: ${[...rewritten.keys()].join(', ')}`)

  const dynamic = renames.flatMap(({ ns, from }) =>
    (scan.usages.get(qualifyKey(ns, from)) ?? [])
      .filter((usage: KeypathUsage) => usage.dynamic)
      .map((usage) => `  ${qualifyKey(ns, from)}: ${usage.file}:${usage.line}`),
  )
  if (dynamic.length) {
    console.log('\ndynamic usages (built at runtime, not rewritten, recheck manually):')
    for (const location of dynamic) console.log(location)
  }

  // Raised whether or not the scan matched anything: a key assembled from pieces never matches,
  // so "none found" is exactly the case where a stale reference survives the rename.
  console.log(
    `\nreminder: a key built at runtime cannot be matched by the scanner, so a reference to ${renames
      .map(({ from }) => `"${from}"`)
      .join(', ')} may still be assembled somewhere in the source. Grep for its segments before calling this done.`,
  )
}
