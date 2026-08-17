import { createHash } from 'node:crypto'
import { mkdir, readdir, rm, rmdir, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'

/** How long a refusal leaves the way open, so a deliberate retry lands without a second refusal. */
export const UNLOCK_MS = 5 * 60 * 1000

const MARKERS = join(tmpdir(), 'loccy-tool-guard')

function digest(value: string): string {
  return createHash('sha1').update(value).digest('hex').slice(0, 16)
}

/** Closed windows, and the scope directories that outlast them. Whatever tmpdir keeps is tmpdir's. */
async function pruneClosed(dir: string): Promise<void> {
  for (const name of await readdir(dir).catch(() => [])) {
    const marker = join(dir, name)
    try {
      if (Date.now() - statSync(marker).mtimeMs >= UNLOCK_MS) await rm(marker, { force: true })
    } catch {
      // Gone already, which is where this was taking it.
    }
  }

  for (const name of await readdir(MARKERS).catch(() => [])) {
    await rmdir(join(MARKERS, name)).catch(() => {})
  }
}

/**
 * Whether to refuse `subject` under `scope`, which every attempt outside an open window is. The
 * marker's age is the window: a repeat within it goes through, since these refusals exist to catch a
 * reach for the wrong tool or a term slipped past, not to put anything out of reach. Once the window
 * closes the next attempt is refused afresh, so an attempt arriving with the reasoning that earned
 * the exception long gone is weighed again.
 */
export async function refuseOnce(scope: string, subject: string): Promise<boolean> {
  const dir = join(MARKERS, digest(scope))
  const marker = join(dir, digest(subject))

  try {
    if (Date.now() - statSync(marker).mtimeMs < UNLOCK_MS) return false
  } catch {
    // No marker yet, so nothing has been said about this one.
  }

  await pruneClosed(dir)

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(marker, subject)
    return true
  } catch {
    // No way to remember the refusal means no way to let a retry through, and a guard that cannot
    // be got past would block every attempt for the rest of the session.
    return false
  }
}
