import type { Locale, Namespace } from '@repo/types/primitives.types'
import { getFramework } from '../registry'

/** Rewrite linked-message references (`@:old` → `@:new`) inside a serialized resource file. */
function rewriteLinkedRefs(
  content: string,
  oldKeypath: string,
  newKeypath: string,
  framework: string,
  targetNs?: string,
): string {
  const utils = getFramework(framework)?.ideInsert?.linkedMessageUtils
  if (!utils) {
    return content
  }
  const search = utils.build(oldKeypath, targetNs)
  if (!content.includes(search)) {
    return content
  }
  const regex = new RegExp(utils.regex.source, utils.regex.flags)
  return content.replace(regex, (match, ref) => {
    const { keypath: refKeypath, ns: refNs } = utils.parse(ref)
    if (refKeypath === oldKeypath && refNs === targetNs) {
      return match.replace(oldKeypath, newKeypath)
    }
    return match
  })
}

/**
 * Follow a key rename through the linked-message references in a module's own files, returning only
 * the files whose text changed. A file in the renamed key's own namespace refers to it unqualified,
 * so the reference to look for differs per file.
 */
export function rewriteLinkedRefsInContents(
  contents: Map<string, string>,
  localeMap: Map<string, { locale: Locale; namespace: Namespace }>,
  framework: string,
  oldKeypath: string,
  newKeypath: string,
  ns: Namespace,
): Map<string, string> {
  const changed = new Map<string, string>()
  if (!getFramework(framework)?.ideInsert?.linkedMessageUtils) {
    return changed
  }

  for (const [relativePath, content] of contents) {
    const fileNs = localeMap.get(relativePath)?.namespace
    const targetNs = fileNs === ns ? undefined : ns
    const next = rewriteLinkedRefs(content, oldKeypath, newKeypath, framework, targetNs)
    if (next !== content) {
      changed.set(relativePath, next)
    }
  }

  return changed
}
