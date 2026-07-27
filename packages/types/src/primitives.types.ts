export type Locale = string
export type Localized<T> = Record<Locale, T>
export type LocalizedText = Record<Locale, string>

export type Namespace = string
export type Namespaced<T> = Record<Namespace, T>

export type NamespaceOrLocale = 'namespace' | 'locale'

export type NestedObject = Record<string, unknown>
