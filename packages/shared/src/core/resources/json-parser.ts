import { sortObjectKeys } from '../helpers/helpers'
import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceFormat } from '../contracts'
import { jsonKeypathRanges } from './keypath-ranges'
import { resolveSortKeys } from '../loccy-config/defaults-detection/detect-sort-keys'
import { detectIndentation, detectTrailingNewLines } from './format-detection'
import * as treeOps from './nested-keypath-ops'
import { NestedTreeParser, type TreeFileMetadata } from './nested-tree-parser'

export type JsonFileMetadata = TreeFileMetadata

export class JsonParser extends NestedTreeParser<JsonFileMetadata> {
  static fromObject(data: NestedObject, metadata: JsonFileMetadata): JsonParser {
    const parser = Object.create(JsonParser.prototype) as JsonParser
    parser.data = data
    parser.metadata = metadata
    parser.sortKeys = resolveSortKeys(data, metadata.sortKeys)
    return parser
  }

  constructor(content: string, sortKeys?: boolean) {
    const parsedContent = JSON.parse(content)

    if (typeof parsedContent !== 'object' || parsedContent === null || Array.isArray(parsedContent)) {
      throw new Error('JSON root must be an object')
    }

    const data = parsedContent as NestedObject
    const metadata: JsonFileMetadata = {
      trailingNewLines: detectTrailingNewLines(content),
      indentString: detectIndentation(content),
      sortKeys,
      structure: treeOps.detectStructure(data),
    }

    super(data, metadata, resolveSortKeys(data, sortKeys))
  }

  get content() {
    let stringified = JSON.stringify(
      this.sortKeys ? sortObjectKeys(this.data) : this.data,
      null,
      this.metadata.indentString,
    )
    stringified += '\n'.repeat(this.metadata.trailingNewLines)
    return stringified
  }

  cloneEmpty(): JsonParser {
    return JsonParser.fromObject({}, { ...this.metadata })
  }
}

export const jsonResourceFormat: ResourceFormat = {
  id: 'json',
  extensions: ['json'],
  emptyContent: '{}',
  parse: (content, sortKeys) => new JsonParser(content, sortKeys),
  keypathRanges: jsonKeypathRanges,
}
