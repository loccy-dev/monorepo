import { existsSync } from 'node:fs'
import { dirname, join } from 'pathe'
import { loccyConfigFilename } from '@repo/types/config.types'

/**
 * The directory everything is read and written relative to: the nearest one at or above `start`
 * holding `loccy.yaml`. A session opens wherever the user happens to be, which in a monorepo is a
 * package rather than the root the config sits at, and a tool that only ever looks where it stands
 * reports a project with no i18n setup at all.
 *
 * The walk stops at the repository, so a config above it, one directory further up somebody's
 * projects folder, is never taken for this project's. Nothing found leaves `start` as it was, which
 * is what the "no config here" messages are about.
 */
export function findProjectRoot(start: string): string {
  let dir = start

  for (;;) {
    if (existsSync(join(dir, loccyConfigFilename))) return dir
    if (existsSync(join(dir, '.git'))) return start

    const parent = dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}
