import { getFramework } from '@repo/shared/core/registry'
import { resourceService } from './resource-service'

/**
 * Escapes characters in a string that have special meaning in a regular expression.
 * @param str The string to escape.
 * @returns The escaped string, safe to be used within a new RegExp().
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Parses parameter names from placeholder patterns across a set of strings, e.g. "Hello, {{name}}!".
 * @returns Found parameter names as keys (values are unused placeholders).
 */
export function parseParamNames(text: string[], moduleName?: string): Record<string, string> {
  const framework = resourceService.ideInsertFramework(moduleName)
  const wrap = getFramework(framework)!.ideInsert!.interpolationWrap

  const escapedPrefix = escapeRegex(wrap.prefix)
  const escapedSuffix = escapeRegex(wrap.suffix)

  // dynamic regex between prefix/suffix; 'g' = all matches, '(.+?)' = non-greedy capture
  const placeholderRegex = new RegExp(`${escapedPrefix}(.+?)${escapedSuffix}`, 'g')

  const matches = []
  for (const str of text) {
    if (str && str.trim()) {
      matches.push(...str.matchAll(placeholderRegex))
    }
  }

  const names: Record<string, string> = {}
  for (const match of matches) {
    // match[0]=full match (e.g. "{{name}}"), match[1]=captured name
    if (match[1]) {
      names[match[1].trim()] = ''
    }
  }

  return names
}
