// Shared `t(...)` call-text builder for `ideInsert.insertTFunctionText`: strips the tFunctionInfo
// prefix, quotes the keypath, appends params as an options object, and wraps for the caller-detected
// interpolation context. The wrap is a code-language concern (Vue `{{ }}` vs JSX `{}`), so the
// caller (via `wrapInterpolation`) — not the framework — decides it.

import type { InsertTFunctionTextParams } from '../contracts'

/** Strip a leading `tFunctionInfo.prefix` from a keypath (the prefix is implicit in the call). */
export function stripTFunctionPrefix(keypath: string, prefix?: string): string {
  return prefix && keypath.startsWith(prefix + '.') ? keypath.slice(prefix.length + 1) : keypath
}

/** Extra leading options-object pieces before `params` (react-i18next's `ns: '...'`). `qt` is the resolved quote character. */
type ExtraPieces = (tFunctionInfo: InsertTFunctionTextParams['tFunctionInfo'], qt: string) => string[]

/** `{ count: expr }`, or shorthand `count` when the expr equals the var (or is absent). */
function countPiece(count: NonNullable<InsertTFunctionTextParams['count']>): string {
  const expr = count.expr ?? count.var
  return count.var === expr ? count.var : `${count.var}: ${expr}`
}

export function buildTFunctionCallText(
  { tFunctionInfo, keypath, params, quoteType, wrapInterpolation, count }: InsertTFunctionTextParams,
  extraPieces?: ExtraPieces,
  opts?: { positionalCount?: boolean },
): string {
  const qt = quoteType === 'single' ? "'" : '"'

  const finalKeypath = stripTFunctionPrefix(keypath, tFunctionInfo.prefix)

  const pieces = extraPieces?.(tFunctionInfo, qt) ?? []
  // Count as an options-object piece, unless the framework takes it positionally (vue-i18n).
  if (count && !opts?.positionalCount) pieces.push(countPiece(count))
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      pieces.push(k === v ? k : `${k}: ${v ? v : qt + qt}`)
    }
  }

  let text = `${tFunctionInfo.tName}(${qt}${finalKeypath}${qt}`
  if (count && opts?.positionalCount) text += `, ${count.expr ?? count.var}`
  if (pieces.length) text += `, { ${pieces.join(', ')} }`
  text += ')'

  if (wrapInterpolation) {
    text = wrapInterpolation === '{{}}' ? `{{ ${text} }}` : `{${text}}`
  }
  return text
}
