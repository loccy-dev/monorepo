// Parses and builds file paths using organization patterns with {locale} and {namespace} placeholders

import type { LayoutPattern } from '@repo/types/config.types'
import { escapeRegExp } from '../usages/key-detection/helpers'
const LOCALE_PATTERN = '(?<locale>[a-zA-Z]{2}(?:-[a-zA-Z]{2,})?)'
const NAMESPACE_SINGLE = '(?<namespace>[^/]+)'
const NAMESPACE_GREEDY = '(?<namespace>.+)'

export interface ParsedOrganization {
  locale: string
  namespace: string | undefined
}

/**
 * Convert an organization pattern to a regex.
 * Supports: {locale}, {namespace} (single segment), {namespace}** (greedy multi-segment)
 */
function buildRegex(organization: string): RegExp {
  // split pattern into segments by /
  const segments = organization.split('/')
  const regexParts: string[] = []

  for (const segment of segments) {
    if (segment === '{locale}' || segment.includes('{locale}')) {
      // segment contains {locale} — e.g. "{locale}.json", "{locale}"
      const escaped = escapeRegExp(segment).replace('\\{locale\\}', LOCALE_PATTERN)
      regexParts.push(escaped)
    } else if (segment === '{namespace}**' || segment.includes('{namespace}**')) {
      // greedy namespace — captures remaining path segments (must come last in path)
      const escaped = escapeRegExp(segment).replace('\\{namespace\\}\\*\\*', NAMESPACE_GREEDY)
      regexParts.push(escaped)
    } else if (segment === '{namespace}' || segment.includes('{namespace}')) {
      // single-segment namespace
      const escaped = escapeRegExp(segment).replace('\\{namespace\\}', NAMESPACE_SINGLE)
      regexParts.push(escaped)
    } else {
      // literal segment — treat * as glob wildcard (any non-slash chars)
      regexParts.push(segment.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+'))
    }
  }

  return new RegExp('^' + regexParts.join('/') + '$')
}

/**
 * Parse a file path against an organization pattern to extract locale and namespace.
 *
 * The relFile should be relative to the resource include's static prefix — i.e. the
 * variable part of the path that the organization pattern describes.
 *
 * Examples:
 *   parseOrganization("{locale}.json", "en.json") → { locale: "en", namespace: undefined }
 *   parseOrganization("{locale}/{namespace}.json", "en/common.json") → { locale: "en", namespace: "common" }
 *   parseOrganization("{locale}/{namespace}**.json", "en/a/b/c.json") → { locale: "en", namespace: "a/b/c" }
 */
export function parseOrganization(organization: string, relFile: string): ParsedOrganization | null {
  const regex = buildRegex(organization)
  const match = relFile.match(regex)
  if (match?.groups?.locale) {
    return { locale: match.groups.locale, namespace: match.groups.namespace }
  }

  return null
}

/**
 * Build a file path from locale + namespace using the organization pattern (reverse of parse).
 *
 * For {namespace}** patterns, the namespace value may contain "/" for multi-level paths.
 */
export function buildPathFromOrganization(organization: string, locale: string, namespace?: string): string {
  let result = organization
  if (organization.includes('{locale}')) {
    result = result.replace('{locale}', locale)
  }
  // replace greedy namespace first (before single)
  if (result.includes('{namespace}**')) {
    result = result.replace('{namespace}**', namespace ?? '')
  }
  result = result.replace('{namespace}', namespace ?? '')
  return result
}

/**
 * Check whether an organization pattern contains a {namespace} placeholder.
 */
export function hasNamespace(organization: string): boolean {
  return organization.includes('{namespace}')
}

// --- Layout wrappers: a layout is a single pattern OR per-locale patterns (`*` = fallback) ---

/**
 * Parse a file path against a layout. For a per-locale map, specific-locale entries are tried
 * first (their pattern may omit `{locale}`, in which case the map key supplies the locale), then
 * the `*` fallback pattern.
 */
export function parseLayout(layout: LayoutPattern, relFile: string): ParsedOrganization | null {
  if (typeof layout === 'string') return parseOrganization(layout, relFile)

  for (const [locale, pattern] of Object.entries(layout)) {
    if (locale === '*') continue
    const match = relFile.match(buildRegex(pattern))
    if (match) return { locale: match.groups?.locale ?? locale, namespace: match.groups?.namespace }
  }
  const fallback = layout['*']
  return fallback ? parseOrganization(fallback, relFile) : null
}

/** Build a file path for a locale/namespace from a layout (reverse of parsing). */
export function buildPathFromLayout(layout: LayoutPattern, locale: string, namespace?: string): string {
  if (typeof layout === 'string') return buildPathFromOrganization(layout, locale, namespace)
  const pattern = layout[locale] ?? layout['*'] ?? Object.values(layout)[0] ?? ''
  return buildPathFromOrganization(pattern, locale, namespace)
}

/** Whether any pattern in the layout carries a `{namespace}` placeholder. */
export function layoutHasNamespace(layout: LayoutPattern): boolean {
  return typeof layout === 'string' ? hasNamespace(layout) : Object.values(layout).some(hasNamespace)
}
