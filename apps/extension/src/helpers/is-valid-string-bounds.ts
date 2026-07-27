/**
 * Validates whether detected text boundaries likely contain a valid string literal
 * rather than accidentally captured code. Uses language-agnostic heuristics.
 */
export function isValidStringBounds(
  originalText: string,
  bounds: { start: number; end: number; text: string },
): boolean {
  // If no bounds found or empty, invalid
  if (bounds.start === bounds.end || !bounds.text) {
    return false
  }

  const content = bounds.text.trim()
  const contentLength = content.length

  // 1. Check for excessive line breaks (usually indicates captured too much)
  const lineCount = content.split('\n').length
  if (lineCount > 2) {
    // Exception: template literals and multiline strings can span multiple lines
    const boundaryChars = getBoundaryChars(originalText, bounds)
    const isMultilineCapable =
      boundaryChars.start === '`' ||
      (boundaryChars.start === '"' && boundaryChars.end === '"' && isTripleQuoted(originalText, bounds))

    if (!isMultilineCapable) {
      return false
    }
  }

  // 2. Programming symbols that are common in code but less common in strings
  const programmingSymbols = new Set([
    '<',
    '>',
    '=',
    ';',
    '{',
    '}',
    '(',
    ')',
    '[',
    ']',
    '&',
    '|',
    '^',
    '%',
    '+',
    '*',
    '/',
    '\\',
    '?',
    ':',
  ])

  let symbolCount = 0
  for (const char of content) {
    if (programmingSymbols.has(char)) {
      symbolCount++
    }
  }

  // 3. Calculate symbol density - strings shouldn't have too many programming symbols
  const symbolDensity = symbolCount / contentLength
  const maxSymbolDensity = 0.25 // Allow up to 25% programming symbols

  if (symbolDensity > maxSymbolDensity && symbolCount > 3) {
    return false
  }

  // 4. Check for programming patterns (language-agnostic)
  const suspiciousPatterns = [
    // Assignment-like patterns
    /\w+\s*[=:]\s*\w+/g,
    // Arrow/pointer patterns
    /[=-]>/g,
    // Function call patterns
    /\w+\s*\(/g,
    // Multiple operators in sequence
    /[=<>!+\-*/%&|]{2,}/g,
    // Semicolon endings (code-like)
    /;\s*$/gm,
    // Bracket pairs (object/array-like)
    /\[[^\]]*\]/g,
    /\{[^}]*\}/g,
  ]

  let patternCount = 0
  for (const pattern of suspiciousPatterns) {
    const matches = content.match(pattern)
    if (matches) {
      patternCount += matches.length
    }
  }

  // If too many programming patterns, likely not a string
  const maxPatterns = Math.max(2, Math.floor(contentLength / 20)) // Scale with content size
  if (patternCount > maxPatterns) {
    return false
  }

  // 5. Character distribution check - code tends to have more punctuation variety
  const uniquePunctuation = new Set()
  for (const char of content) {
    // Use Unicode categories to properly identify punctuation across all languages
    if (/[\p{P}\p{S}]/u.test(char)) {
      uniquePunctuation.add(char)
    }
  }

  // If too many different punctuation marks, likely code
  const maxUniquePunctuation = Math.max(5, Math.floor(contentLength / 10))
  if (uniquePunctuation.size > maxUniquePunctuation) {
    return false
  }

  return true
}

/**
 * Helper function to extract the actual boundary characters used.
 */
function getBoundaryChars(
  originalText: string,
  bounds: { start: number; end: number },
): { start: string; end: string } {
  const startChar = bounds.start > 0 ? originalText[bounds.start - 1] : ''
  const endChar = bounds.end < originalText.length ? originalText[bounds.end] : ''
  return { start: startChar, end: endChar }
}

/**
 * Helper to detect triple-quoted strings (Python, etc.)
 */
function isTripleQuoted(originalText: string, bounds: { start: number; end: number }): boolean {
  const beforeStart = originalText.substring(Math.max(0, bounds.start - 3), bounds.start)
  const afterEnd = originalText.substring(bounds.end, Math.min(originalText.length, bounds.end + 3))

  return (
    (beforeStart.endsWith('"""') || beforeStart.endsWith("'''")) &&
    (afterEnd.startsWith('"""') || afterEnd.startsWith("'''"))
  )
}
