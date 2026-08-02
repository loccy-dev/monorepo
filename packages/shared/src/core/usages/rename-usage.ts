import type { KeypathInfo } from '@repo/types/framework.types'
import { qualifyKey } from '../helpers/namespace.helpers'

/**
 * Replacement text for the key literal of a usage being renamed, spelled the way that literal
 * already spells keys: relative to a scoped t-function's prefix, and namespaced where the literal
 * carried its namespace, since dropping it would silently repoint the call at the default one.
 */
function renamedKeyText(info: KeypathInfo, newKeypath: string): string {
  const prefix = info.prefix
  const keypath = prefix && newKeypath.startsWith(`${prefix}.`) ? newKeypath.slice(prefix.length + 1) : newKeypath
  return info.nsInKeypath ? qualifyKey(info.ns, keypath) : keypath
}

/** A key literal to overwrite: `start`/`end` sit inside the quotes, so they stay untouched. */
export interface UsageRenameEdit {
  start: number
  end: number
  text: string
}

/**
 * Where to write the new key for each given usage, ordered back-to-front so applying one edit
 * cannot shift the offsets of the next. `loc` spans the quoted literal, hence the ±1.
 *
 * Selecting which usages to rename is the caller's: a key built at runtime is never renamable, but
 * the rest depends on how the caller matched them.
 */
export function renameUsageEdits(usages: KeypathInfo[], newKeypath: string): UsageRenameEdit[] {
  return [...usages]
    .sort((a, b) => b.loc.start - a.loc.start)
    .map((info) => ({
      start: info.loc.start + 1,
      end: info.loc.end - 1,
      text: renamedKeyText(info, newKeypath),
    }))
}

/** One key's renamable usages within a single file, paired with the key they become. */
export interface UsageRename {
  usages: KeypathInfo[]
  newKeypath: string
}

/**
 * Rewrite several keys' usages in one file's source text. Edits are applied back-to-front across
 * every key at once, so renaming two keys in one file cannot shift the other's offsets.
 */
export function rewriteUsagesInSource(content: string, renames: UsageRename[]): string {
  const edits = renames
    .flatMap(({ usages, newKeypath }) => renameUsageEdits(usages, newKeypath))
    .sort((a, b) => b.start - a.start)

  let result = content
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  }
  return result
}
