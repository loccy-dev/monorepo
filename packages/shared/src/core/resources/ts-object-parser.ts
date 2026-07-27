// Resource format for `.ts`/`.js` files exporting a plain object literal
// (`export default {...}`, `module.exports = {...}`). Parsed as JSON5 (a permissive JSON
// superset: unquoted keys, single quotes, trailing commas, comments) after stripping the
// wrapper — covers the common "typed resource module" convention without executing code.
// Files with dynamic content (imports, function calls, spread, computed keys, …) fail to
// parse and are skipped, same as a malformed JSON file.

import JSON5 from 'json5'
import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceFormat } from '../contracts'
import { jsonKeypathRanges } from './keypath-ranges'
import { sortObjectKeys } from '../helpers/helpers'
import { resolveSortKeys } from '../loccy-config/defaults-detection/detect-sort-keys'
import { detectIndentation, detectTrailingNewLines } from './format-detection'
import * as treeOps from './nested-keypath-ops'
import { NestedTreeParser, type TreeFileMetadata } from './nested-tree-parser'

export interface TsObjectFileMetadata extends TreeFileMetadata {
  /** e.g. `export default `, `module.exports = ` — reproduced verbatim on serialize. */
  wrapperPrefix: string
}

const WRAPPER_PATTERNS: { prefix: string; regex: RegExp }[] = [
  { prefix: 'export default ', regex: /export\s+default\s+/ },
  { prefix: 'module.exports = ', regex: /module\.exports\s*=\s*/ },
  { prefix: 'exports.default = ', regex: /exports\.default\s*=\s*/ },
]

/** Only whitespace and/or `import ... from '...'` lines — real typed-resource files often lead with a type-only import for a `satisfies` annotation. */
function isOnlyLeadingImports(text: string): boolean {
  return text.split('\n').every((line) => line.trim() === '' || line.trim().startsWith('import '))
}

function splitWrapper(content: string): { prefix: string; expression: string } {
  for (const { prefix, regex } of WRAPPER_PATTERNS) {
    const match = content.match(regex)
    if (!match || !isOnlyLeadingImports(content.slice(0, match.index))) continue
    const expression = content
      .slice(match.index! + match[0].length)
      .trim()
      .replace(/\s+as\s+const\s*;?\s*$/, '')
      .replace(/\s+satisfies\s+[\w.<>[\], ]+;?\s*$/, '')
      .replace(/;\s*$/, '')
    return { prefix, expression }
  }
  throw new Error('Unsupported TS/JS resource file: expected `export default {...}` or `module.exports = {...}`')
}

export class TsObjectParser extends NestedTreeParser<TsObjectFileMetadata> {
  static fromObject(data: NestedObject, metadata: TsObjectFileMetadata): TsObjectParser {
    const parser = Object.create(TsObjectParser.prototype) as TsObjectParser
    parser.data = data
    parser.metadata = metadata
    parser.sortKeys = resolveSortKeys(data, metadata.sortKeys)
    return parser
  }

  /** Create from `.ts`/`.js` module source */
  constructor(content: string, sortKeys?: boolean) {
    const { prefix, expression } = splitWrapper(content)
    const parsed: unknown = JSON5.parse(expression)

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('Resource module must export an object')
    }

    const data = parsed as NestedObject
    const metadata: TsObjectFileMetadata = {
      wrapperPrefix: prefix,
      trailingNewLines: detectTrailingNewLines(content),
      indentString: detectIndentation(content) || '  ',
      sortKeys,
      structure: treeOps.detectStructure(data),
    }

    super(data, metadata, resolveSortKeys(data, sortKeys))
  }

  get content(): string {
    const body = JSON5.stringify(
      this.sortKeys ? sortObjectKeys(this.data) : this.data,
      null,
      this.metadata.indentString,
    )
    return this.metadata.wrapperPrefix + body + '\n'.repeat(this.metadata.trailingNewLines || 1)
  }

  cloneEmpty(): TsObjectParser {
    return TsObjectParser.fromObject({}, { ...this.metadata })
  }
}

export const tsObjectResourceFormat: ResourceFormat = {
  id: 'ts-object',
  extensions: ['ts', 'js', 'mjs', 'cjs'],
  emptyContent: 'export default {}\n',
  parse: (content, sortKeys) => new TsObjectParser(content, sortKeys),
  // JS object literal — the JSON scanner handles quotes + bare identifier keys after the first `{`
  keypathRanges: jsonKeypathRanges,
}
