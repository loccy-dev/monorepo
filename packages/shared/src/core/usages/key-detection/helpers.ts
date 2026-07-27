import type { KeypathInfo } from '@repo/types/framework.types'
import type { Loc } from '@repo/types/platform.types'

export const sameLoc = (a: Loc, b: Loc): boolean => a.start === b.start && a.end === b.end

export function mergeKeyInfo(base: KeypathInfo[], addition: KeypathInfo[], ignoreIfInside = false): KeypathInfo[] {
  const result = [...base]
  for (const item of addition) {
    if (ignoreIfInside) {
      const isInsideStatic = result.some(
        (r) =>
          (r.type === 'static' || r.type === 'plurals') && r.loc.start <= item.loc.start && r.loc.end >= item.loc.end,
      )
      if (isInsideStatic) {
        continue
      }
    }

    const existing = result.find((r) => sameLoc(r.loc, item.loc))
    if (existing) {
      if (item.ns && !existing.ns) {
        existing.ns = item.ns
      }
      // If keypath(s) differ, prefer the longer one (for prefix, context, etc.)
      const itemTotalKeysLength = item.keypaths.join('').length
      const existingTotalKeysLength = existing.keypaths.join('').length
      if (itemTotalKeysLength > existingTotalKeysLength) {
        existing.keypaths = item.keypaths
      }
    } else {
      result.push(item)
    }
  }
  return result
}

export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Chunk keypaths to ensure union pattern stays under max length
 */
function chunkByPatternLength(escapedKeypaths: string[], maxLength: number): string[][] {
  const chunks: string[][] = []
  let currentChunk: string[] = []
  let currentLength = 0

  for (const keypath of escapedKeypaths) {
    const additionalLength = currentChunk.length === 0 ? keypath.length : keypath.length + 1

    if (currentChunk.length > 0 && currentLength + additionalLength > maxLength) {
      chunks.push(currentChunk)
      currentChunk = [keypath]
      currentLength = keypath.length
    } else {
      currentChunk.push(keypath)
      currentLength += additionalLength
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

const MAX_PATTERN_LENGTH = 5000

/**
 * Collect generic matches (plain strings that match existing keypaths)
 */
export async function collectGenericMatches(
  content: string,
  existingKeypaths: string[],
  handleMatchesFn: (
    content: string,
    regexpData: { regexp: RegExp; parseExpression: (e: string) => any },
    resolver: null,
    existing: KeypathInfo[],
    checkNested: boolean,
  ) => Promise<KeypathInfo[]>,
): Promise<KeypathInfo[]> {
  let result: KeypathInfo[] = []

  const existingLongEnoughKeypaths = existingKeypaths.filter((k) => k.length > 1 && /[^a-z]/.test(k.slice(1)))

  if (existingLongEnoughKeypaths.length === 0) {
    return result
  }

  const escapedKeypaths = existingLongEnoughKeypaths.map(escapeRegExp)
  const chunks = chunkByPatternLength(escapedKeypaths, MAX_PATTERN_LENGTH)

  for (const chunk of chunks) {
    const unionPattern = chunk.join('|')
    const keypathAsPlainStringRegexp = new RegExp(`(?<expression>(['"\`])(?:${unionPattern})\\2)`, 'g')

    result = mergeKeyInfo(
      result,
      await handleMatchesFn(
        content,
        {
          regexp: keypathAsPlainStringRegexp,
          parseExpression: (expression: string) => ({
            keypathExpression: {
              content: expression,
              clean: expression.slice(1, -1),
            },
            keypathStatic: expression.slice(1, -1),
          }),
        },
        null,
        result,
        false,
      ),
    )
  }

  return result
}
