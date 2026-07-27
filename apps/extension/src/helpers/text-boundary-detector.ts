/** Simplified text boundary detector for extracting content between quote pairs. */

class TextBoundaryDetector {
  /** Map of opening boundary characters to their corresponding closing characters. */
  boundaries = new Map([
    ['"', '"'],
    ["'", "'"],
    ['`', '`'],
    ['>', '<'],
  ])

  /** Finds text boundaries around a cursor position and returns the inner content. */
  findBounds(text: string, cursorPos: number, trimWhitespace: boolean = false) {
    let start = cursorPos
    let end = cursorPos

    // Try to resolve text range from single position
    for (let leftBound = cursorPos - 1; leftBound >= 0; leftBound--) {
      const currLeftChar = text[leftBound]

      if (this.boundaries.has(currLeftChar)) {
        // Skip escaped quotes
        if (this.isEscaped(text, leftBound)) {
          continue
        }

        // Skip apostrophes that are inside words
        if (currLeftChar === "'" && this.isApostropheInWord(text, leftBound)) {
          continue
        }

        const rightChar = this.boundaries.get(currLeftChar)
        let matchedIndex = -1

        // Try to get matching character on the opposite side
        for (let rightBound = cursorPos; rightBound < text.length; rightBound++) {
          const currRightChar = text[rightBound]
          if (currRightChar === rightChar) {
            // Skip escaped quotes
            if (this.isEscaped(text, rightBound)) {
              continue
            }

            // Skip apostrophes that are inside words
            if (currRightChar === "'" && this.isApostropheInWord(text, rightBound)) {
              continue
            }
            matchedIndex = rightBound
            break
          }
        }

        if (matchedIndex !== -1) {
          // Indices adjusted to exclude the boundary characters
          const rawStart = leftBound + 1
          const rawEnd = matchedIndex

          if (trimWhitespace) {
            // Skip leading whitespace/newlines
            start = this.findFirstNonWhitespace(text, rawStart, rawEnd)
            // Skip trailing whitespace/newlines
            end = this.findLastNonWhitespace(text, rawStart, rawEnd) + 1
          } else {
            start = rawStart
            end = rawEnd
          }

          break
        }
      }
    }

    return {
      start,
      end,
      text: this.unescape(text.substring(start, end)),
    }
  }

  /** Finds the first non-whitespace character position within the given range. */
  findFirstNonWhitespace(text: string, start: number, end: number): number {
    for (let i = start; i < end; i++) {
      if (!/\s/.test(text[i])) {
        return i
      }
    }
    return end
  }

  /** Finds the last non-whitespace character position within the given range. */
  findLastNonWhitespace(text: string, start: number, end: number): number {
    for (let i = end - 1; i >= start; i--) {
      if (!/\s/.test(text[i])) {
        return i
      }
    }
    return start - 1
  }

  /** Unescapes common escape sequences in extracted string content. */
  unescape(text: string): string {
    return text
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\b/g, '\b')
      .replace(/\\f/g, '\f')
      .replace(/\\v/g, '\v')
      .replace(/\\0/g, '\0')
  }

  /** Checks if a quote character is escaped by counting preceding backslashes. */
  isEscaped(text: string, pos: number): boolean {
    let backslashCount = 0
    for (let i = pos - 1; i >= 0 && text[i] === '\\'; i--) {
      backslashCount++
    }
    return backslashCount % 2 === 1
  }

  /** Checks if apostrophe is between two word characters (letters, digits, underscore). */
  isApostropheInWord(text: string, pos: number): boolean {
    const before = pos > 0 ? text[pos - 1] : ''
    const after = pos < text.length - 1 ? text[pos + 1] : ''

    // If apostrophe is between two word characters, it's likely part of a word
    return /\w/.test(before) && /\w/.test(after)
  }
}

/** Singleton instance for convenient usage. */
export const textBoundaryDetector = new TextBoundaryDetector()
