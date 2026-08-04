import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { rewriteLinkedRefsInContents } from '@repo/shared/core/resources/linked-refs'
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
import { collapsePaths } from '../file-list'
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

/** Rename keys across every locale file, following the linked references between messages. */
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

  await writeAllOrNothing(ctx.platform, changed)

  for (const { ns, from, to } of renames) {
    console.log(`renamed: ${qualifyKey(ns, from)} -> ${qualifyKey(ns, to)}`)
  }
  console.log(`files: ${collapsePaths([...changed.keys()])}`)
  if (linked.size) console.log(`linked references rewritten in: ${collapsePaths([...linked.keys()])}`)
}
