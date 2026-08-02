import type { ResolvedModule } from '@repo/types/config.types'
import type { KeypathInfo } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import type { Namespace } from '@repo/types/primitives.types'
import { qualifyKey } from '../helpers/namespace.helpers'
import { createUsageScanner } from './usage-scanner'

export interface KeypathUsage {
  file: string
  /** 1-based, ready to print as `file:line`. */
  line: number
  /** Key built at runtime — the scanner can't match it reliably, so it needs a manual recheck. */
  dynamic: boolean
  info: KeypathInfo
}

/** A key as its own namespace plus keypath, which is the only form that identifies it uniquely. */
export interface QualifiedKeypath {
  ns: Namespace
  keypath: string
}

/**
 * Whether a usage refers to a key in `ns`. A usage that names no namespace refers to the default
 * one, so the same keypath under two namespaces stays two different keys.
 */
export function usageMatchesNamespace(info: KeypathInfo, ns: Namespace, defaultNs: Namespace): boolean {
  return (info.ns || defaultNs) === ns
}

/**
 * Source usages of the given keys, grouped by `qualifyKey(ns, keypath)`. Keys with no usage are
 * absent from the map rather than mapped to an empty array. `scannedFiles` says how many source
 * files were read, which is what separates "nothing uses this" from "nothing was looked at".
 */
export async function findUsagesByKeypath(
  platform: Platform,
  module: ResolvedModule,
  keys: QualifiedKeypath[],
  allLocales: string[] = [],
): Promise<{ byKey: Map<string, KeypathUsage[]>; scannedFiles: number }> {
  const byKey = new Map<string, KeypathUsage[]>()
  if (!module.usages.include.length || !keys.length) return { byKey, scannedFiles: 0 }

  const scanner = await createUsageScanner(
    platform,
    module,
    keys.map((key) => key.keypath),
    null,
    allLocales,
  )
  const { perFile, scannedFiles } = await scanner.scan()

  for (const [file, keyInfos] of perFile) {
    for (const info of keyInfos) {
      for (const key of keys) {
        if (!info.keypaths.includes(key.keypath)) continue
        if (!usageMatchesNamespace(info, key.ns, scanner.defaultNs)) continue
        const qualified = qualifyKey(key.ns, key.keypath)
        const usages = byKey.get(qualified) ?? []
        usages.push({ file, line: info.loc.line + 1, dynamic: info.type !== 'static', info })
        byKey.set(qualified, usages)
      }
    }
  }

  return { byKey, scannedFiles }
}
