// Shared plumbing for tree-shaped (dot-keypath) resource formats — JSON, PHP array, TS/JS object
// literal, YAML. Parsing/serialization is format-specific (subclasses); keypath mutation and
// flattening are identical across all of them, so they're implemented once here.

import type { ResourceStructure } from '@repo/types/framework.types'
import type { NestedObject } from '@repo/types/primitives.types'
import { flattenObject } from '../helpers/helpers'
import * as treeOps from './nested-keypath-ops'

export interface TreeFileMetadata {
  trailingNewLines: number
  indentString: string
  sortKeys?: boolean // undefined if `auto`
  structure: ResourceStructure
}

export abstract class NestedTreeParser<M extends TreeFileMetadata = TreeFileMetadata> {
  data: NestedObject
  metadata: M
  sortKeys: boolean

  protected constructor(data: NestedObject, metadata: M, sortKeys: boolean) {
    this.data = data
    this.metadata = metadata
    this.sortKeys = sortKeys
  }

  abstract get content(): string
  /** Empty document mirroring this one's formatting/metadata — for creating a new locale file. */
  abstract cloneEmpty(): NestedTreeParser<M>

  get flatData(): Record<string, string> {
    return flattenObject(this.data)
  }

  // also used for new keypath insertion
  updateValue(keypath: string, newValue: string): void {
    treeOps.updateValue(this.data, this.metadata.structure, keypath, newValue)
  }

  deleteKeypath(keypath: string): string | undefined {
    return treeOps.deleteKeypath(this.data, keypath, this.metadata.structure) as string | undefined
  }

  renameKeypath(oldKeypath: string, newKeypath: string): void {
    this.data = treeOps.renameKeypath(this.data, this.metadata.structure, oldKeypath, newKeypath)
  }
}
