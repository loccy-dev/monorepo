import { getFramework } from '@repo/shared/core/registry'
import { resourceService } from './resource-service'

export interface SrcTextWithParams {
  value: string
  params: Record<string, string>
}

const quotedStringRegex = /^(['"`])((?:\\.|.)*?)\1$/

/**
 * Generates a descriptive, camelCase identifier from a TypeScript expression string.
 * It intelligently handles function calls, property access, and simple variables.
 *
 * @param paramExpr The expression string (e.g., "$formatCurrency(100)", "user.name").
 * @returns A user-friendly, valid identifier (e.g., "formatCurrency", "userName").
 */
function generateBaseIdentifier(paramExpr: string): string {
  let name = paramExpr.trim()

  // Heuristic: Check if the expression is a function call.
  const funcCallMatch = name.match(/^([\w\.\$]+)\s*\(/)

  if (funcCallMatch) {
    // e.g., "helpers.formatDate(date)" -> "formatDate"
    const fullName = funcCallMatch[1]
    name = fullName.split('.').pop() ?? ''
  }
  // non-function calls (e.g. "user.name") fall through to sanitization below -> "userName"

  name = name
    .replace(/^[^a-zA-Z_]+/, '') // Remove leading symbols like '$'.
    .replace(/[^a-zA-Z0-9_]+/g, ' ') // Replace dots, etc., with spaces.
    .trim()
    .replace(/\s+([a-zA-Z])/g, (_match, letter) => letter.toUpperCase()) // CamelCase.
    .replace(/\s/g, '') // Remove leftover spaces.

  // If the process results in an empty or numeric-only string, fallback to "param".
  if (!name || /^\d+$/.test(name)) {
    return 'param'
  }

  // Ensure the identifier starts with a lowercase letter.
  return name.charAt(0).toLowerCase() + name.slice(1)
}

export function extractParams(content: string, moduleName?: string): SrcTextWithParams {
  const framework = resourceService.ideInsertFramework(moduleName)
  let trimmed = content.trim().replace(/\s*\r?\n\s*/g, ' ')

  // Heuristic to check for string concatenation and convert to template literal
  if (
    trimmed.includes('+') &&
    trimmed.length > 2 &&
    trimmed
      .slice(1, -1)
      .split('')
      .find((c) => /['"`]/.test(c) && (trimmed[0] === c || trimmed[trimmed.length - 1] === c))
  ) {
    trimmed = convertToTemplateLiteral(trimmed)
  }

  trimmed = unquote(trimmed)
  const value = trimmed
  const params: Record<string, string> = {}
  let result = ''
  let lastIndex = 0

  while (lastIndex < value.length) {
    // Find the start of the next interpolation
    const nextHbs = value.indexOf('{{', lastIndex)
    const nextTpl = value.indexOf('${', lastIndex)
    const nextJsx = value.indexOf('{', lastIndex)

    let start = Math.min(...[nextHbs, nextTpl, nextJsx].filter((i) => i !== -1), Infinity)

    if (start === Infinity) {
      break // No more interpolations found
    }

    // Append the text before the interpolation
    result += value.substring(lastIndex, start)

    let startToken: string
    let endToken: string

    if (start === nextHbs) {
      startToken = '{{'
      endToken = '}}'
    } else if (start === nextTpl) {
      startToken = '${'
      endToken = '}'
    } else {
      startToken = '{'
      endToken = '}'
    }

    // Find the matching end token by counting nested braces
    let level = 1
    let searchFrom = start + startToken.length
    let end = -1

    while (searchFrom < value.length) {
      const nextOpen = value.indexOf('{', searchFrom)
      const nextClose = value.indexOf('}', searchFrom)

      if (nextClose === -1) {
        break // Unmatched open brace
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        level++
        searchFrom = nextOpen + 1
      } else {
        level--
        if (level === 0) {
          end = nextClose + endToken.length
          if (endToken === '}}' && value.substring(nextClose, end) !== '}}') {
            // Found a single '}' but expected '}}'. This is a syntax error
            // or a single '}' inside the expression. Reset level and continue.
            level++
            searchFrom = nextClose + 1
            end = -1
            continue
          }
          break
        }
        searchFrom = nextClose + 1
      }
    }

    if (end !== -1) {
      const paramExpr = value.substring(start + startToken.length, end - endToken.length).trim()

      if (paramExpr === '') {
        result += '{}'
      } else {
        let name = generateBaseIdentifier(paramExpr)

        // Ensure the generated name is unique
        if (Object.prototype.hasOwnProperty.call(params, name)) {
          let i = 2
          let tempName = `${name}${i}`
          while (Object.prototype.hasOwnProperty.call(params, tempName)) {
            i++
            tempName = `${name}${i}`
          }
          name = tempName
        }

        params[name] = paramExpr
        const wrap = getFramework(framework)!.ideInsert!.interpolationWrap
        result += `${wrap.prefix}${wrap.spacing}${name}${wrap.spacing}${wrap.suffix}`
      }
      lastIndex = end
    } else {
      // No matching end token found, treat the rest of the string as literal
      break
    }
  }

  // Append any remaining text after the last interpolation
  result += value.substring(lastIndex)

  return {
    value: result,
    params,
  }
}

function convertToTemplateLiteral(input: string): string {
  const parts = input.split(/\s*\+\s*/g)
  let result = ''

  for (const part of parts) {
    const trimmedPart = part.trim()

    if (quotedStringRegex.test(trimmedPart)) {
      const unquoted = unquote(trimmedPart)
      const unquotedEscaped = trimmedPart.startsWith('`') ? unquoted : escapeString(unquoted)
      result += unquotedEscaped
    } else {
      result += '${' + part + '}'
    }
  }

  return unescapeString(result)
}

function unquote(content: string) {
  return content.match(quotedStringRegex)?.[2] ?? content
}

// escape specials for a backtick template literal
function escapeString(content: string) {
  return content.replaceAll('`', '\\`').replaceAll('${', '\\${')
}

// reverse backtick template-literal escaping
function unescapeString(content: string) {
  return content.replaceAll('\\`', '`').replaceAll('\\${', '${')
}
