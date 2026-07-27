// YAML parser with light formatting preservation (indent width, trailing newlines).
// Comments are not round-tripped — js-yaml re-serializes from the parsed data tree, so anything
// not represented in that tree is lost.

import { load, dump } from 'js-yaml'
import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceFormat } from '../contracts'
import { yamlKeypathRanges } from './keypath-ranges'
import { sortObjectKeys } from '../helpers/helpers'
import { resolveSortKeys } from '../loccy-config/defaults-detection/detect-sort-keys'
import { detectIndentation, detectTrailingNewLines } from './format-detection'
import * as treeOps from './nested-keypath-ops'
import { NestedTreeParser, type TreeFileMetadata } from './nested-tree-parser'

export type YamlFileMetadata = TreeFileMetadata

export class YamlParser extends NestedTreeParser<YamlFileMetadata> {
  static fromObject(data: NestedObject, metadata: YamlFileMetadata): YamlParser {
    const parser = Object.create(YamlParser.prototype) as YamlParser
    parser.data = data
    parser.metadata = metadata
    parser.sortKeys = resolveSortKeys(data, metadata.sortKeys)
    return parser
  }

  constructor(content: string, sortKeys?: boolean) {
    const parsed: unknown = load(content)

    // An empty/missing document is a valid empty resource; anything parsed to a non-object root
    // (a list, a bare scalar, …) is a malformed resource file — same as JSON/PHP/TS, it must not
    // be silently treated as empty (that would clobber the real content on next write).
    if (parsed !== undefined && parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) {
      throw new Error('YAML resource file root must be a mapping')
    }

    const data: NestedObject = (parsed as NestedObject | undefined) ?? {}
    const metadata: YamlFileMetadata = {
      trailingNewLines: detectTrailingNewLines(content),
      indentString: detectIndentation(content) || '  ',
      sortKeys,
      structure: treeOps.detectStructure(data),
    }

    super(data, metadata, resolveSortKeys(data, sortKeys))
  }

  get content(): string {
    const dumped = dump(this.sortKeys ? sortObjectKeys(this.data) : this.data, {
      indent: this.metadata.indentString.length,
      lineWidth: -1,
      noRefs: true,
    })
    return dumped.replace(/\n*$/, '') + '\n'.repeat(this.metadata.trailingNewLines)
  }

  cloneEmpty(): YamlParser {
    return YamlParser.fromObject({}, { ...this.metadata })
  }
}

export const yamlResourceFormat: ResourceFormat = {
  id: 'yaml',
  extensions: ['yaml', 'yml'],
  emptyContent: '',
  parse: (content, sortKeys) => new YamlParser(content, sortKeys),
  keypathRanges: yamlKeypathRanges,
}
