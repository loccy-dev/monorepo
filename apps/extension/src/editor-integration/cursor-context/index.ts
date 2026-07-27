export type CodeFamily = 'vue' | 'react'

/** The cursor-context engine for the file being edited, by its extension. Backend/template files
 *  (php, python, java, html, po, …) map to neither — callers fall back to plain text-boundary
 *  detection. Per-file, not project-wide: a repo can mix `.vue` and `.tsx`. */
export function codeFamilyForExt(fileExt: string): CodeFamily | undefined {
  if (fileExt === 'vue') {
    return 'vue'
  }
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts'].includes(fileExt)) {
    return 'react'
  }
  return undefined
}
