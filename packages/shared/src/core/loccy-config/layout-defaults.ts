// The default translations layout — derived from a framework's filename convention and file
// extension. Resolves an absent `layout`, and tells the scaffold whether to spell one out.

import type { NamespaceOrLocale } from '@repo/types/primitives.types'
import { getFramework } from '../registry'

/** `{locale}/{namespace}.<ext>` when files are per-namespace, else `{locale}.<ext>`. */
export function buildLayout(filenameMeaning: NamespaceOrLocale | null, ext: string): string {
  return filenameMeaning === 'namespace' ? `{locale}/{namespace}.${ext}` : `{locale}.${ext}`
}

/** A framework's layout by naming convention, or its explicit `defaultLayout` when the convention can't express the pattern. */
export function frameworkDefaultLayout(frameworkId: string, ext: string): string {
  const framework = getFramework(frameworkId)
  return framework?.defaultLayout ?? buildLayout(framework?.defaultFilenameMeaning ?? null, ext)
}
