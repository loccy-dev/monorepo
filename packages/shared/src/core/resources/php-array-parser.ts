// Resource format for Laravel-style PHP array files: `<?php return [ 'key' => 'value', ... ];`.
// Parsed via a real PHP AST (php-parser) — never evaluated/executed — so only a static array
// literal of strings/numbers/booleans/null/nested arrays is understood. Anything dynamic
// (variable references, function calls, constants, `include`, …) fails to parse and the file
// is skipped, same as a malformed JSON file.

import {
  Engine,
  Array as PhpArrayNode,
  String as PhpStringNode,
  Number as PhpNumberNode,
  Boolean as PhpBooleanNode,
  Entry as PhpEntry,
  Return as PhpReturnNode,
  Program as PhpProgram,
  Node as PhpNode,
} from 'php-parser'
import type { NestedObject } from '@repo/types/primitives.types'
import type { ResourceFormat } from '../contracts'
import { phpArrayKeypathRanges } from './keypath-ranges'
import { sortObjectKeys } from '../helpers/helpers'
import { resolveSortKeys } from '../loccy-config/defaults-detection/detect-sort-keys'
import { detectIndentation, detectTrailingNewLines } from './format-detection'
import * as treeOps from './nested-keypath-ops'
import { NestedTreeParser, type TreeFileMetadata } from './nested-tree-parser'

export type PhpArrayFileMetadata = TreeFileMetadata

function parsePhp(content: string): PhpProgram {
  // suppressErrors: false — a syntax error must throw (caller skips the file), not silently
  // produce a truncated/wrong tree.
  const engine = new Engine({ parser: { extractDoc: false, suppressErrors: false }, ast: { withPositions: false } })
  return engine.parseCode(content, 'resource.php')
}

// Narrow php-parser's loose base `Node` to the concrete value nodes we evaluate, via the `kind`
// discriminant — the concrete classes all extend `Node`, so these predicates are sound.
const isArrayNode = (node: PhpNode): node is PhpArrayNode => node.kind === 'array'
const isStringNode = (node: PhpNode): node is PhpStringNode => node.kind === 'string'
const isNumberNode = (node: PhpNode): node is PhpNumberNode => node.kind === 'number'
const isBooleanNode = (node: PhpNode): node is PhpBooleanNode => node.kind === 'boolean'
const isEntryNode = (node: PhpNode): node is PhpEntry => node.kind === 'entry'

function extractRootArray(program: PhpProgram): PhpArrayNode {
  const returnStatement = program.children.find((c): c is PhpReturnNode => c.kind === 'return')
  if (!returnStatement?.expr || !isArrayNode(returnStatement.expr)) {
    throw new Error('PHP resource file must be `<?php return [...];`')
  }
  return returnStatement.expr
}

/** Evaluate a static PHP AST value node into plain data — never executes code. */
function evalNode(node: PhpNode): unknown {
  if (isArrayNode(node)) return evalArray(node)
  if (isStringNode(node)) return node.value
  // php-parser's `Number.value` is the raw numeric-literal source text (a string), not an
  // actual JS number — left as-is it would round-trip back out quoted, silently turning a PHP
  // int/float into a string.
  if (isNumberNode(node)) return Number(node.value)
  if (isBooleanNode(node)) return node.value
  if (node.kind === 'nullkeyword') return null
  throw new Error(`Unsupported PHP value: ${node.kind}`)
}

function evalArray(node: PhpArrayNode): unknown {
  const items = node.items ?? []
  // php-parser wraps every item — keyed or not — in an Entry node, so `key === null` (not the
  // node kind) is what actually distinguishes a positional list from an associative array.
  // An empty `[]` defaults to an (empty) associative array — resource files are dictionaries.
  const isList = items.length > 0 && items.every((item) => isEntryNode(item) && item.key === null)

  if (isList) {
    return items.map((item) => evalNode((item as PhpEntry).value))
  }

  const obj: Record<string, unknown> = {}
  for (const item of items) {
    if (!isEntryNode(item) || !item.key || !isStringNode(item.key)) continue // dynamic/computed key — skip
    obj[item.key.value] = evalNode(item.value)
  }
  return obj
}

function escapePhpSingleQuoted(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Always single-quoted on output — avoids accidental variable/`{$expr}` interpolation from double-quoted PHP strings. */
function serializePhpValue(value: unknown, indentString: string, depth: number): string {
  const pad = indentString.repeat(depth + 1)
  const closePad = indentString.repeat(depth)

  if (value === null || value === undefined) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return `'${escapePhpSingleQuoted(value)}'`

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map((v) => `${pad}${serializePhpValue(v, indentString, depth + 1)},`).join('\n')
    return `[\n${items}\n${closePad}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
  if (entries.length === 0) return '[]'
  const items = entries
    .map(([k, v]) => `${pad}'${escapePhpSingleQuoted(k)}' => ${serializePhpValue(v, indentString, depth + 1)},`)
    .join('\n')
  return `[\n${items}\n${closePad}]`
}

export class PhpArrayParser extends NestedTreeParser<PhpArrayFileMetadata> {
  static fromObject(data: NestedObject, metadata: PhpArrayFileMetadata): PhpArrayParser {
    const parser = Object.create(PhpArrayParser.prototype) as PhpArrayParser
    parser.data = data
    parser.metadata = metadata
    parser.sortKeys = resolveSortKeys(data, metadata.sortKeys)
    return parser
  }

  /** Create from `<?php return [...];` source */
  constructor(content: string, sortKeys?: boolean) {
    const ast = parsePhp(content)
    const rootArray = extractRootArray(ast)
    const evaluated = evalArray(rootArray)

    if (typeof evaluated !== 'object' || evaluated === null || Array.isArray(evaluated)) {
      throw new Error('PHP resource file root must be an associative array')
    }

    const data = evaluated as NestedObject
    // Scan indentation from `return` onward — a blank line after `<?php` (common convention)
    // would otherwise confuse the leading-whitespace heuristic.
    const returnIndex = content.indexOf('return')
    const metadata: PhpArrayFileMetadata = {
      trailingNewLines: detectTrailingNewLines(content),
      indentString: detectIndentation(returnIndex >= 0 ? content.slice(returnIndex) : content) || '    ',
      sortKeys,
      structure: treeOps.detectStructure(data),
    }

    super(data, metadata, resolveSortKeys(data, sortKeys))
  }

  get content(): string {
    const dataToSerialize = this.sortKeys ? sortObjectKeys(this.data) : this.data
    const body = serializePhpValue(dataToSerialize, this.metadata.indentString, 0)
    return `<?php\n\nreturn ${body};` + '\n'.repeat(this.metadata.trailingNewLines || 1)
  }

  cloneEmpty(): PhpArrayParser {
    return PhpArrayParser.fromObject({}, { ...this.metadata })
  }
}

export const phpArrayResourceFormat: ResourceFormat = {
  id: 'php-array',
  extensions: ['php'],
  emptyContent: '<?php\n\nreturn [];\n',
  parse: (content, sortKeys) => new PhpArrayParser(content, sortKeys),
  keypathRanges: phpArrayKeypathRanges,
}
