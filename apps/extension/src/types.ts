import type { Loc } from '@repo/types/platform.types'
import type { TFunctionInfo } from '@repo/types/framework.types'

export interface BaseNode {
  loc: Loc
  value?: string
}

export enum NodeTraverseError {
  NotFound = 'NotFound',
  NoActiveEditor = 'NoActiveEditor',
  SelectManually = 'SelectManually',
}

export type NodeTraverseResult = {
  node: BaseNode | null
  error: NodeTraverseError | null
}

export type InsertTFunctionProps = {
  loc: Loc
  keypath: string
  tFunctionInfo: TFunctionInfo
  /** The owning module's quote style — injected by the `insertTFunction` dispatcher, not the caller. */
  quoteType: 'single' | 'double'
  params?: Record<string, string>
  /** Plural count argument, set only for plural insertions (see `InsertTFunctionTextParams.count`). */
  count?: { var: string; expr?: string }
  cleanSrcText?: string
  eraseQuotes?: boolean
}
