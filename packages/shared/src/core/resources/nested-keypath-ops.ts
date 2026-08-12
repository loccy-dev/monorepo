// Format-agnostic operations on a nested (dot-keypath) or flat resource data tree.
// Shared by every `ResourceDocument` implementation (JSON, YAML, TS/JS object, PHP array, …) —
// the tree-mutation semantics (rename/delete/update, incl. unnest/renest edge cases) are
// identical across formats; only serialization differs per format.

import { get, set } from 'lodash-es'
import type { ResourceStructure } from '@repo/types/framework.types'
import type { NestedObject } from '@repo/types/primitives.types'
import { deserializeValue } from '../helpers/helpers'

type TreeNode = string | { [key: string]: TreeNode }

export function detectStructure(obj: NestedObject): 'nested' | 'flat' {
  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    return 'flat'
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return 'nested'
    }
  }

  return 'flat'
}

// also used for new keypath insertion
export function updateValue(
  data: NestedObject,
  structure: ResourceStructure,
  keypath: string,
  newValue: unknown,
): void {
  if (!newValue) {
    deleteKeypath(data, keypath, structure)
  } else if (structure === 'nested') {
    set(data, keypath, deserializeValue(newValue))
  } else {
    data[keypath] = deserializeValue(newValue)
  }
}

/** Deletes the keypath and returns its prior value (any type — a leaf isn't always a string), or `undefined` if the path didn't exist. */
export function deleteKeypath(data: NestedObject, keypath: string, structure: ResourceStructure): unknown {
  const root = data as Record<string, TreeNode>

  if (structure === 'nested') {
    const keypathArray = keypath.split('.')
    let current: Record<string, TreeNode> = root

    const path: Record<string, TreeNode>[] = [current]
    for (let i = 0; i < keypathArray.length - 1; i++) {
      const key = keypathArray[i]!
      const next = current[key]
      if (!next || typeof next !== 'object') {
        return // Path doesn't exist
      }
      current = next
      path.push(current)
    }

    const targetKey = keypathArray[keypathArray.length - 1]!
    const val = current[targetKey]
    if (!(targetKey in current)) {
      return undefined // Key doesn't exist
    }
    delete current[targetKey]

    // Clean up empty parent objects (work backwards)
    for (let i = keypathArray.length - 2; i >= 0; i--) {
      const parentObj = path[i]!
      const key = keypathArray[i]!
      const child = parentObj[key]

      if (typeof child === 'object' && Object.keys(child).length === 0) {
        delete parentObj[key]
      } else {
        break // Stop if parent is not empty
      }
    }

    return val
  } else {
    const val = root[keypath]
    delete root[keypath]
    return val
  }
}

/**
 * Collapsing oldKeypath's value up into newKeypath only avoids data loss if every level between
 * them has exactly one child — otherwise sibling keys at that level get discarded when the
 * parent object is replaced by the (single) leaf value.
 */
function canCollapseWithoutDataLoss(data: NestedObject, oldKeypath: string, newKeypath: string): boolean {
  let current: Record<string, TreeNode> = data as Record<string, TreeNode>
  const parentPath = newKeypath.split('.')
  const remainderPath = oldKeypath.slice(newKeypath.length + 1).split('.')

  for (const key of parentPath) {
    const next = current[key]
    if (typeof next === 'object') current = next
  }

  for (const key of remainderPath) {
    if (Object.keys(current).length > 1) return false // a sibling here would be discarded
    const next = current[key]
    if (typeof next === 'object') current = next
  }

  return true
}

/**
 * Whether newKeypath is free to receive oldKeypath's value: any existing non-empty value at or
 * before the target segment blocks the rename — overwriting a leaf, or turning a leaf into a
 * container, would silently destroy data.
 */
function isNewKeypathValid(data: NestedObject, oldKeypath: string, newKeypath: string): boolean {
  let current: Record<string, TreeNode> = data as Record<string, TreeNode>

  // newKeypath nests inside oldKeypath's current location — always safe, the old leaf is being replaced anyway
  if (newKeypath.startsWith(oldKeypath + '.')) {
    return true
  }

  // oldKeypath nests inside newKeypath's location — collapsing up, defer to the sibling-safety check
  if (oldKeypath.startsWith(newKeypath + '.')) {
    return canCollapseWithoutDataLoss(data, oldKeypath, newKeypath)
  }

  for (const key of newKeypath.split('.')) {
    const val = current[key]
    if (!val) return true // empty or nonexistent — free to write
    if (typeof val !== 'object') return false // existing leaf, mid-path or at the target — always a conflict
    current = val
  }
  return false // whole newKeypath already exists as a nested object
}

export function shouldRenameOnly(data: NestedObject, oldKeypath: string, newKeypath: string): boolean {
  const oldKeypathArray = oldKeypath.split('.')
  const newKeypathArray = newKeypath.split('.')

  let level = 0
  for (let i = 0; i < newKeypathArray.length; i++) {
    if (newKeypathArray[i] === oldKeypathArray[i]) {
      level++
    } else {
      break
    }
  }

  const commonPathBeginning = oldKeypathArray.slice(0, level).join('.')
  const oldKeypathArrayDiff = oldKeypathArray.slice(level)
  const newKeypathArrayDiff = newKeypathArray.slice(level)

  let obj: NestedObject = commonPathBeginning ? (get(data, commonPathBeginning) as NestedObject) : data
  // From an old tree leaf to the branching point
  for (const key of oldKeypathArrayDiff) {
    if (typeof obj[key] !== 'object') {
      continue
    }
    obj = obj[key] as NestedObject
    if (Object.keys(obj).length === 1) {
      continue
    }
    // Part of the subtree must be moved
    return false
  }
  // Should not conflict with existing
  obj = commonPathBeginning ? (get(data, commonPathBeginning) as NestedObject) : data
  const firstNewDiff = newKeypathArrayDiff[0]
  return firstNewDiff === undefined || obj[firstNewDiff] === undefined
}

/** Returns the resulting tree — the top-level key rename (i === 0) requires a new object, so this cannot mutate in place. */
function renameKeypathWithoutMovement(data: NestedObject, oldKeypath: string, newKeypath: string): NestedObject {
  const oldValue = get(data, oldKeypath)! as string

  const oldKeypathArray = oldKeypath.split('.')
  const newKeypathArray = newKeypath.split('.')

  const renameKey = (obj: object, from: string, to: string) =>
    Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]))

  let result = data

  for (let i = 0; i < Math.max(newKeypathArray.length, oldKeypathArray.length); i++) {
    // May be undefined past the shorter array's end — the branches below handle each case.
    const oldPathPart = oldKeypathArray[i]
    const newPathPart = newKeypathArray[i]
    if (i === 0) {
      // top-level segment: always exists on both sides — rename the key in place
      result = renameKey(result, oldPathPart ?? '', newPathPart ?? '') as NestedObject
    } else if (oldPathPart === undefined) {
      // newKeypath is deeper than oldKeypath (nesting the value further in) — write it at its final depth
      set(result, newKeypath, oldValue)
    } else if (newPathPart === undefined) {
      // newKeypath is shallower than oldKeypath (collapsing the value up) — drop the now-obsolete deeper path, write at newKeypath
      const updatedOldKeypath = [newKeypathArray, ...oldKeypathArray.slice(i)].join('.')
      deleteKeypath(result, updatedOldKeypath, 'nested')
      set(result, newKeypath, oldValue)
    } else {
      // same depth at this level — rename the key here, keep descending
      const pathToObject = newKeypathArray.slice(0, i).join('.')
      const currObj = get(result, pathToObject)!
      set(result, pathToObject, renameKey(currObj, oldPathPart, newPathPart))
    }
  }

  return result
}

/** Flat keys are literal, so a rename is plain key substitution — only an existing key of that name blocks it. */
function renameFlatKeypath(data: NestedObject, oldKeypath: string, newKeypath: string): NestedObject {
  if (!(oldKeypath in data) || newKeypath in data) {
    return data
  }

  return Object.fromEntries(
    Object.entries(data).map(([k, v]) => {
      if (k === oldKeypath) {
        return [newKeypath, v]
      }
      return [k, v]
    }),
  )
}

export function renameKeypath(
  data: NestedObject,
  structure: ResourceStructure,
  oldKeypath: string,
  newKeypath: string,
): NestedObject {
  if (structure !== 'nested') {
    return renameFlatKeypath(data, oldKeypath, newKeypath)
  }

  const keypathExists = get(data, oldKeypath) !== undefined
  if (!keypathExists) {
    return data
  }

  if (!isNewKeypathValid(data, oldKeypath, newKeypath)) {
    return data
  }

  if (shouldRenameOnly(data, oldKeypath, newKeypath)) {
    return renameKeypathWithoutMovement(data, oldKeypath, newKeypath)
  }

  const val = deleteKeypath(data, oldKeypath, structure)
  if (!val) {
    return data
  }
  updateValue(data, structure, newKeypath, val)
  return data
}
