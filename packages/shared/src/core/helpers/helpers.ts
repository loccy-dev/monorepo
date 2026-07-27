/** Arrays are serialized to JSON strings so they appear as single editable values (covers react-i18next arrays etc). */
export function serializeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return JSON.stringify(value)
  }
  return value
}

/**
 * Parses JSON array strings back to arrays. Non-string values (numbers, booleans, already-parsed
 * objects) pass through unchanged — a resource tree isn't always string-only leaves.
 */
export function deserializeValue(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    const trimmed = value.trimStart()
    if (trimmed.startsWith('[')) {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch {
    // keep as string
  }
  return value
}

export function flattenObject<T>(obj: object, parentKey = '', result: Record<string, T> = {}): Record<string, T> {
  for (const [key, value] of Object.entries(obj)) {
    const keypath = parentKey ? `${parentKey}.${key}` : key
    const serialized = serializeValue(value)
    if (serialized !== value) {
      result[keypath] = serialized as T
    } else if (value && typeof value === 'object') {
      flattenObject(value as object, keypath, result)
    } else {
      result[keypath] = value
    }
  }
  return result
}

export function getLineIndex(text: string, position: number) {
  let lineIndex = 0
  for (let i = 0; i < position; i++) {
    if (text[i] === '\n') {
      lineIndex++
    }
  }
  return lineIndex
}

export function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys)
  }
  return Object.keys(obj)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = sortObjectKeys(obj[key])
      return acc
    }, {})
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

export function s(count: number, suffix = 's') {
  if (count === 1) {
    return ''
  }
  return suffix
}

/** Most frequent item; ties broken alphabetically for determinism. `undefined` for an empty list. */
export function mostCommon(items: string[]): string | undefined {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1)
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).sort(([, a], [, b]) => b - a)[0]?.[0]
}

/**
 * Match a keypath against `excludeKeys`-style patterns.
 *
 * Keypath is `namespace:keypath` (or bare `keypath` when there's no namespace).
 * A pattern with `*` is treated as a glob (`.` literal, `*` → `.*`); a plain pattern
 * matches only the exact key — use `prefix.*` to match everything under it.
 */
export function isKeypathExcluded(keypath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$')
      return regex.test(keypath)
    }
    return keypath === pattern
  })
}
