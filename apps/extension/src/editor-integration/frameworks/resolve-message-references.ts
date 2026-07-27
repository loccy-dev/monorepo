import { resourceService } from '../../helpers/resource-service'
import { getFramework } from '@repo/shared/core/registry'

const MAX_DEPTH = 10

export function resolveMessageReferences(
  value: string,
  locale: string,
  ns: string,
  moduleName?: string,
  visited = new Set<string>(),
  depth = 0,
): string {
  if (typeof value !== 'string') {
    return JSON.stringify(value)
  }

  if (depth > MAX_DEPTH) {
    return value
  }

  // Linked-message syntax is per the value's OWN module framework — a `@:`/`$t()` ref means nothing
  // in a module whose framework has no linked-message support (e.g. custom), so it renders verbatim.
  const framework = resourceService.moduleFramework(moduleName)
  const utils = getFramework(framework)!.ideInsert?.linkedMessageUtils
  if (!utils) {
    return value
  }

  // clone regex to reset lastIndex for global patterns
  const regex = new RegExp(utils.regex.source, utils.regex.flags)

  return value.replace(regex, (match, keypathAndMaybeNs) => {
    if (visited.has(keypathAndMaybeNs)) {
      return `[circular: ${keypathAndMaybeNs}]`
    }

    const { keypath, ns: maybeNewNs } = utils.parse(keypathAndMaybeNs)

    const translations = resourceService.getFlatTranslationsPerKeypath(maybeNewNs ?? ns, moduleName)[keypath]

    const resolved = translations?.[locale]
    if (!resolved) {
      return `[missing: ${keypathAndMaybeNs}]`
    }

    const newVisited = new Set([...visited])
    newVisited.add(keypathAndMaybeNs)

    return resolveMessageReferences(resolved, locale, maybeNewNs ?? ns, moduleName, newVisited, depth + 1)
  })
}
