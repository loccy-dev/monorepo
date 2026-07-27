// Shared detection helpers for preserving original file formatting on round-trip.

export function detectIndentation(content: string): string {
  const match = content.match(/\n(\s+)/)
  const whitespace = match?.[1]
  if (!whitespace) return ''

  const firstChar = whitespace[0]
  if (firstChar === '\t') {
    const tabCount = whitespace.match(/^\t+/)?.[0].length || 1
    return '\t'.repeat(tabCount)
  }
  const spaceCount = whitespace.match(/^ +/)?.[0].length || 2
  return ' '.repeat(spaceCount)
}

export function detectTrailingNewLines(content: string): number {
  const match = content.match(/\n+$/)
  return match ? match[0].length : 0
}

export function detectQuoteStyle(content: string): "'" | '"' {
  let single = 0
  let double = 0
  let firstSingle = -1
  let firstDouble = -1
  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === "'") {
      single++
      if (firstSingle === -1) firstSingle = i
    } else if (ch === '"') {
      double++
      if (firstDouble === -1) firstDouble = i
    }
  }
  if (single > double) return "'"
  if (double > single) return '"'
  // tie (including both zero): whichever appears first wins; fall back to "
  if (firstSingle === -1 && firstDouble === -1) return '"'
  if (firstSingle === -1) return '"'
  if (firstDouble === -1) return "'"
  return firstSingle < firstDouble ? "'" : '"'
}
