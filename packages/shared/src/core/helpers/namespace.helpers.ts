/** Sentinel namespace for resources/frameworks that don't use namespaces at all. */
export const NS_WITHOUT_NS = '_'

/** Format a key as `namespace:keypath`, or bare `keypath` when the namespace is absent/sentinel. */
export const qualifyKey = (ns: string | undefined | null, keypath: string): string =>
  ns && ns !== NS_WITHOUT_NS ? `${ns}:${keypath}` : keypath
