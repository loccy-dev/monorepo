// --- Usage signatures: simple hash for matching usages across code changes ---

export function createSignature(code: string): string {
  let hash = 0
  const withoutSpaces = code.replace(/\s+/g, '')
  for (let i = 0; i < withoutSpaces.length; i++) {
    const char = withoutSpaces.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return hash.toString(36)
}

interface ExtractCodeContextOptions {
  charsCount?: number
  replaceKeyWith?: string
  ignoreSpaces?: boolean
}
/** Surrounding code context: up to `charsCount` chars before `start` and after `end`. */
export function extractCodeContext(
  content: string,
  start: number,
  end: number,
  options: ExtractCodeContextOptions,
): string | undefined {
  if (start < 0 || end > content.length || start > end) {
    return undefined
  }

  const { charsCount = 1000, replaceKeyWith, ignoreSpaces = false } = options

  let beforeStart: number
  let afterEnd: number

  if (ignoreSpaces) {
    // Count non-space chars going backwards from start
    let nonSpaceCount = 0
    beforeStart = start
    while (beforeStart > 0 && nonSpaceCount < charsCount) {
      beforeStart--
      if (!/\s/.test(content.charAt(beforeStart))) {
        nonSpaceCount++
      }
    }

    // Count non-space chars going forwards from end
    nonSpaceCount = 0
    afterEnd = end
    while (afterEnd < content.length && nonSpaceCount < charsCount) {
      if (!/\s/.test(content.charAt(afterEnd))) {
        nonSpaceCount++
      }
      afterEnd++
    }
  } else {
    beforeStart = Math.max(0, start - charsCount)
    afterEnd = Math.min(content.length, end + charsCount)
  }

  const prefix = content.slice(beforeStart, start)
  const middle = replaceKeyWith !== undefined ? replaceKeyWith : content.slice(start, end)
  const suffix = content.slice(end, afterEnd)

  return prefix + middle + suffix
}
