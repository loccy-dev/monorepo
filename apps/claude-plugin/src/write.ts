import type { Platform } from '@repo/types/platform.types'

/** What a file looked like before the batch, `null` where the batch is the thing that creates it. */
type Snapshot = Map<string, string | null>

async function snapshot(platform: Platform, paths: Iterable<string>): Promise<Snapshot> {
  const before: Snapshot = new Map()
  for (const path of paths) {
    before.set(path, (await platform.exists(path)) ? await platform.readFile(path) : null)
  }
  return before
}

async function restore(platform: Platform, before: Snapshot, written: string[]): Promise<string[]> {
  const failures: string[] = []
  for (const path of written) {
    const original = before.get(path)
    try {
      if (original === null) await platform.deleteFile(path)
      else if (original !== undefined) await platform.writeFile(path, original)
    } catch {
      failures.push(path)
    }
  }
  return failures
}

/**
 * Write every file or none. A batch that stops halfway leaves the locales saying different things,
 * which is the one failure this tool exists to prevent, so a failed write puts the rest back.
 */
export async function writeAllOrNothing(platform: Platform, changed: Map<string, string>): Promise<void> {
  // A batch that resolved to no file at all never reaches the filesystem, so without this the
  // command would go on to report every key it "wrote". Nothing found the files: say so.
  if (!changed.size) {
    throw new Error('The batch resolved to no translation file, so nothing was written. Check --module and --ns.')
  }

  const before = await snapshot(platform, changed.keys())
  const written: string[] = []

  try {
    for (const [path, content] of changed) {
      await platform.writeFile(path, content)
      written.push(path)
    }
  } catch (err) {
    const failures = await restore(platform, before, written)
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(
      failures.length
        ? `${reason}\nRolled the batch back, except: ${failures.join(', ')}. Check those files by hand.`
        : `${reason}\nNothing was written: the batch was rolled back.`,
    )
  }
}
