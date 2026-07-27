import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceDocument } from '../../contracts'
import { flattenObject } from '../../helpers/helpers'

/** Format-agnostic: detect if a parsed resource document's keys are sorted alphabetically. */
export function detectSortKeysFromDocument(doc: Pick<ResourceDocument, 'flatData'>): boolean {
  const keys = Object.keys(doc.flatData)
  const sorted = [...keys].sort()
  return keys.every((key, i) => key === sorted[i])
}

/** A resource parser's `sortKeys`: explicit metadata wins, else auto-detected from `data`'s current key order. */
export function resolveSortKeys(data: NestedObject, sortKeys: boolean | undefined): boolean {
  return sortKeys ?? detectSortKeysFromDocument({ flatData: flattenObject(data) })
}
