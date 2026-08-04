import type { KeypathInfo } from '@repo/types/framework.types'
import type { Namespace } from '@repo/types/primitives.types'

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
