// Project config — `loccy.yaml` at repo root: mechanical setup + hand-authored AI guidance
// (styleguide, glossary, do-not-translate). Organized as MODULES: each is one i18n setup — usage
// side (`usages`, axis A) decoupled from storage side (`translations`, axes B+D). A single-setup
// repo still defines one module (conventionally `default`).
//
// This file is the source for the generated `config.schema.json` (YAML-language-server hover in
// the IDE reads straight from it) — every field needs its own JSDoc, placed on its own line
// directly above the field. A same-line `/** ... */ field: T` comment, or a comment only on the
// containing type alias, is silently dropped by the generator and the field gets no hover text.

import type { ActiveFrameworkId, I18nFrameworkId } from './framework.types'
import type { Locale } from './primitives.types'

/** Filename for the project config (repo root). */
export const loccyConfigFilename = 'loccy.yaml'

/**
 * Keys to skip, formatted as `namespace:keypath` (or bare `keypath` when no namespace).
 * Matches the exact key; use `*` glob (e.g. `prefix.*`) to match everything under a prefix.
 * Example: `translations:landing.hero.title`
 */
type ExcludeKeys = string[]

/** `noUnresolvedKeys` rule: enable/disable, or configure with `excludeKeys`. */
export type NoUnresolvedKeysRule =
  | boolean
  | {
      /** Enable/disable the rule. Default: true */
      enabled?: boolean
      excludeKeys?: ExcludeKeys
    }

// --- Modules: one i18n setup each (usage `usages` + storage `translations`) ---

/**
 * How resource files are laid out.
 * - a single pattern: `{locale}.json`, `{locale}/{namespace}.json`
 * - per-locale patterns keyed by locale, with `*` as the fallback — for irregular conventions
 *   (e.g. a suffix-less default file): `{ en: 'messages.properties', '*': 'messages_{locale}.properties' }`
 */
export type LayoutPattern = string | Record<Locale, string>

// The config-facing id sets (`ActiveFrameworkId`, `MessageFormatId`) are CLOSED unions — only
// registered ids are valid in `loccy.yaml`, and the generated schema enumerates them. The registry
// (`@repo/shared/core/registry`) is compile-time checked against these unions via
// `satisfies Record<Id, definition>`, so the type and its registrations cannot drift.

/** Plural-encoding id (message format). Closed set — only registered formats. */
export type MessageFormatId = 'suffix-cldr' | 'icu' | 'vue-pipe' | 'choice-pipe'

/** Usage side (axis A): how translation keys are referenced in source code. */
export interface UsagesConfig {
  /** Glob patterns for source files to scan */
  include: string[]
  exclude?: string[]
  /** Additional t-function names beyond the framework defaults */
  customTFunctions?: string[]
  /** Try matching bare string literals against known keys. Default: true */
  detectKeysInStrings?: boolean
  /** Quote style for inserted t-function calls. Omit to auto-detect from the codebase. */
  quoteType?: 'single' | 'double'
  /** Default namespace for the t-function, when not set explicitly. Only for react-i18next. */
  defaultNamespace?: string
  /** Lint: flag keys used in code but missing from translations. Default: true. */
  noUnresolvedKeys?: NoUnresolvedKeysRule
  /**
   * Lint: flag unused translation keys — removed by lint --fix. Default: true.
   * Dynamically-built keys are whitelisted via `// loccy-used-keys: pattern` comments at the
   * construction site (not config).
   */
  noUnusedKeys?: boolean
}

/** Storage side (axes B+D): how translations are stored and how plurals are encoded. */
export interface TranslationsConfig {
  /**
   * Plural encoding id: `suffix-cldr`, `icu`, `vue-pipe`, … Auto-resolved from the framework +
   * dependencies/values when omitted; a rare explicit override.
   */
  messageFormat?: MessageFormatId
  /** Single glob for this module's translation files. */
  glob: string
  /** How file paths map to locales and namespaces. */
  layout: LayoutPattern
  exclude?: string[]
  /** Lint: require every key translated & non-empty in all locales, except partial-override locales. Default: true. */
  noUntranslatedKeys?: boolean
  /** Lint: flag plurals missing a required form for a locale (per its CLDR rule). Default: true. */
  checkPlurals?: boolean
  /** Lint: deeply sort keys alphabetically. Default: false. */
  sortKeys?: boolean
}

// --- Styleguide (hand-authored AI guidance; holds the glossary + do-not-translate list) ---

/** A term whose literal form must be preserved across all locales. */
export interface DoNotTranslateEntry {
  /** The literal text to preserve. */
  term: string
  /** Respect casing when matching this term. */
  caseSensitive?: boolean
  /** Optional definition (why it's preserved, a spelling detail, etc). */
  definition?: string
}

/** Approved term for one locale: a string, or `{ preferred, deprecated? }` to also flag old forms. */
export type GlossaryLocaleValue =
  | string
  | {
      /** The approved form for this locale. */
      preferred: string
      /** Forms that must never appear for this locale — always flagged. */
      deprecated?: string[]
    }

/** A term with approved per-locale translations, for terminology consistency. */
export interface GlossaryEntry {
  /** What the term means and when it applies. */
  definition: string
  /** Rendering per locale code. */
  terms: Record<string, GlossaryLocaleValue>
}

/** The preferred form for a locale's value. */
export function preferredForm(value: GlossaryLocaleValue): string {
  return typeof value === 'string' ? value : value.preferred
}

/** Deprecated forms for a locale's value (empty when none are set). */
export function deprecatedForms(value: GlossaryLocaleValue): string[] {
  return typeof value === 'string' ? [] : (value.deprecated ?? [])
}

/** Per-locale style guidance: plain prose, or a partial-override object (`extends` + optional `style`). */
export type LocaleValue =
  | string
  | {
      /** Locale this one inherits from, e.g. `de` for `de-CH`. Filled only where it diverges. */
      extends: string
      /** What changes vs the extended locale, in plain language (e.g. `ß becomes ss`). Empty/absent means full inherit. */
      style?: string
    }

/** A locale configured as a partial override: inherits from `extends`, deviating only per `style`. */
export interface PartialOverride {
  locale: string
  extends: string
  style?: string
}

/** Partial-override entries derived from `locales` — those whose value is `{extends, style?}`, not plain prose. */
export function partialOverridesOf(locales: Record<string, LocaleValue> | undefined): PartialOverride[] {
  const out: PartialOverride[] = []
  for (const [locale, value] of Object.entries(locales ?? {})) {
    if (typeof value === 'string') continue
    out.push({ locale, extends: value.extends, style: value.style })
  }
  return out
}

/** Prose + structured guidance for AI translation. */
export interface StyleguideConfig {
  /** Code-side i18n guidance: key naming, file organization, coding conventions (markdown). */
  code?: string
  /** Style guidance applied to every locale (markdown). */
  global?: string
  /** Per-locale styleguide, keyed by locale code — plain prose, or a partial-override entry. */
  locales?: Record<string, LocaleValue>
  /** Terms preserved verbatim in every locale (brand/product names). */
  doNotTranslate?: DoNotTranslateEntry[]
  /** Terms with approved per-locale translations (consistency). */
  glossary?: GlossaryEntry[]
}

// --- Resolved config (canonical, what `readConfigFile` returns) ---

/** A fully-resolved module: mechanical fields populated, ready for scanning/lint. Lint rules live
 * on the axis they check — `sortKeys`/`noUntranslatedKeys` on `translations`, `noUnresolvedKeys`/
 * `noUnusedKeys` on `usages`. Rules stay optional (undefined ⇒ the rule's default), so consumers
 * apply defaults at point-of-use; `resolveModule` fills them for file-backed configs. */
export interface ResolvedModule {
  /** Module name (the `modules` map key; conventionally `default` for a single-setup repo). */
  name: string
  framework: I18nFrameworkId
  translations: Required<Pick<TranslationsConfig, 'messageFormat' | 'glob' | 'layout'>> &
    Pick<TranslationsConfig, 'exclude' | 'noUntranslatedKeys' | 'checkPlurals' | 'sortKeys'>
  usages: UsagesConfig
}

/**
 * The resolved project config. `modules` always has at least one entry (`default` for a
 * single-setup repo). `styleguide` is global (not per-module).
 */
export interface LoccyConfig {
  modules: Record<string, ResolvedModule>
  styleguide?: StyleguideConfig
}

// --- Raw file shape (what a user actually authors in loccy.yaml) ---

/** Raw per-module shape in the file. */
export interface PartialModuleConfig {
  framework?: ActiveFrameworkId
  usages?: Partial<UsagesConfig>
  translations?: Partial<TranslationsConfig>
}

/** Authoring-time schema; see {@link LoccyConfig} for the resolved runtime shape. */
export interface PartialLoccyConfig {
  modules?: Record<string, PartialModuleConfig>
  styleguide?: StyleguideConfig
}
