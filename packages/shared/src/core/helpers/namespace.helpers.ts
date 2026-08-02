/** Sentinel namespace for resources/frameworks that don't use namespaces at all. */
export const NS_WITHOUT_NS = '_'

/** Format a key as `namespace:keypath`, or bare `keypath` when the namespace is absent/sentinel. */
export const qualifyKey = (ns: string | undefined | null, keypath: string): string =>
  ns && ns !== NS_WITHOUT_NS ? `${ns}:${keypath}` : keypath

/**
 * Split a `namespace:keypath` key back into its parts, the inverse of `qualifyKey`. A bare keypath
 * yields a null namespace, leaving the default to the caller. Only the first colon separates: a
 * colon later in the string belongs to the keypath.
 */
export const parseQualifiedKey = (key: string): { ns: string | null; keypath: string } => {
  const separator = key.indexOf(':')
  if (separator === -1) return { ns: null, keypath: key }
  return { ns: key.slice(0, separator), keypath: key.slice(separator + 1) }
}
