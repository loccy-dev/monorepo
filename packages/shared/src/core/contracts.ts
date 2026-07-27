// Contracts for the three orthogonal axes, each its own kind:
//   - `I18nFramework`   — code-side binding: t-function/component detection, insertion.
//   - `MessageFormat`   — value-side encoding: how a plural is spelled (suffix keys vs
//                               inline ICU vs vue pipes). Referenced by id from a framework;
//                               ICU is shared by many frameworks.
//   - `ResourceFormat`  — storage: json/yaml/php/...

import type { MessageFormatId } from '@repo/types/config.types'
import type { I18nFrameworkId, KeypathInfo, TFunctionInfo } from '@repo/types/framework.types'
import type { Loc, Platform } from '@repo/types/platform.types'
import type { PluralCategory, PluralIssue, PluralModel, PluralNumberType } from '@repo/types/plurals.types'
import type { NamespaceOrLocale, NestedObject } from '@repo/types/primitives.types'
import type { DynamicKeyResolverInterface } from './usages/key-detection/types'

export interface FrameworkScanContext {
  defaultNs: string
  customFunctionNames: string[]
  dynamicKeyResolver: DynamicKeyResolverInterface | null
  /** The active message format — decides how a plural usage expands into keypaths. */
  messageFormat: MessageFormat
  /** Project locales — determine the CLDR categories a plural usage requires. Empty when unknown. */
  allLocales: string[]
  /** Known resource keypaths — for existence-driven expansion (i18next's `_zero` rule). Empty when unknown. */
  existingKeypaths: string[]
}

export interface I18nFramework {
  /** Unique id — also the `i18nFramework` config value. */
  id: I18nFrameworkId
  /** Detect this framework from a project's combined dependencies + devDependencies. */
  detectFromDeps(allDeps: Set<string>): boolean
  /** Does a resource filename typically encode the locale or the namespace? Tie-breaker for structure auto-detection. */
  defaultFilenameMeaning: NamespaceOrLocale | null
  /**
   * Overrides the derived `buildLayout(defaultFilenameMeaning, ext)` for frameworks with an
   * irregular file pattern (Spring's `messages_{locale}.properties`). Omit if derived is correct.
   */
  defaultLayout?: string
  /** Glob for this framework's source files — used to seed `source.include` on auto-detect. */
  defaultSourceGlob: string
  /** Detect the default namespace (e.g. from an i18n setup/config file), used when not set explicitly. */
  detectDefaultNs(platform: Platform, translationFileRelativePaths: string[]): Promise<string>
  /** Scan source content for t-function/component key usages. */
  scanContent(content: string, ctx: FrameworkScanContext): Promise<KeypathInfo[]>
  /**
   * Message-format ids this framework can host, in priority order. The active format is
   * `resolveMessageFormat(deps)` when provided, else `messageFormats[0]`.
   */
  messageFormats: MessageFormatId[]
  /**
   * Pick the active message format from project dependencies (e.g. i18next → `icu` when
   * `i18next-icu` is installed). Omit to always use `messageFormats[0]`.
   */
  resolveMessageFormat?(allDeps: Set<string>): MessageFormatId
  /**
   * Optional editor-insertion support — deliberately pure (no editor/AST/cursor access), so it
   * works from CLI/skill too. AST/cursor context detection stays in `apps/extension` (a real
   * TS/Vue/Babel compiler is too heavy for a package that must also run in-browser); IDE detects
   * context, then calls `insertTFunctionText` here for the actual call text.
   */
  ideInsert?: IdeInsertCapability
}

/** Inputs a format needs to decide the keypaths a plural usage references. */
export interface PluralKeypathContext {
  numberType: PluralNumberType
  /** Project locales — determine the union of required CLDR categories. */
  locales: string[]
  /** Known resource keypaths — for existence-driven expansion (i18next's `_zero` rule). */
  existingKeypaths: string[]
}

/**
 * Value-side plural codec — the (parse, serialize) pair against the canonical `PluralModel`,
 * powering lint completeness, hover, and AI generation. Present only on VALUE-LOCUS formats,
 * where the whole plural lives inside one value (icu `{n, plural, …}`, vue `a | b`).
 */
export interface PluralValueCodec {
  /** Decompose a stored value into the canonical model; `null` when the value is not a plural. */
  parseValue(value: string, locale: string): PluralModel | null
  /** Encode a canonical model into this format's value syntax for a target locale. */
  serializeValue(model: PluralModel, locale: string): string
  /**
   * Categories `locale` must define in THIS format. CLDR formats (icu) delegate to
   * `getPluralCategories`; a format overrides when its per-locale forms diverge from CLDR.
   */
  requiredCategories(locale: string, numberType: PluralNumberType): PluralCategory[]
  /** Structural issues for a target locale (missing `requiredCategories`, ICU's mandatory `other`). */
  validate(model: PluralModel, locale: string, numberType: PluralNumberType): PluralIssue[]
}

/**
 * How plurals & interpolation are ENCODED — orthogonal to the framework binding. A format is
 * either KEY-LOCUS or VALUE-LOCUS, distinguished by `valueCodec`:
 *
 *   - KEY-LOCUS (suffix-cldr): the plural spans CLDR sibling keys. `expandPluralKeypaths` fans a
 *     usage out into them; completeness is a key-level concern (which keys exist per locale), so
 *     there is no `valueCodec`.
 *   - VALUE-LOCUS (icu, vue-pipe): the whole plural lives in one value.
 *     `expandPluralKeypaths` returns `[baseKey]`; the `valueCodec` decodes/encodes the value.
 *
 * ICU is hosted by many frameworks and i18next hosts either suffix-cldr or icu — hence a format
 * is referenced by id, never a property baked into each framework.
 */
export interface MessageFormat {
  /** Unique id — the `messageFormat` config value (e.g. `icu`, `suffix-cldr`, `vue-pipe`). */
  id: MessageFormatId
  /** Interpolation delimiters as authored in values. `number` is the count shorthand (ICU `#`). */
  interpolation: { open: string; close: string; number?: string }
  /** Keypaths a plural usage of `baseKey` references. `[baseKey]` for value-locus formats. */
  expandPluralKeypaths(baseKey: string, ctx: PluralKeypathContext): string[]
  /**
   * The sibling keypath one CLDR category maps to — the write-side dual of `expandPluralKeypaths`.
   * Present only on KEY-LOCUS formats (suffix-cldr); value-locus formats encode via `valueCodec`.
   */
  pluralKeyFor?(baseKey: string, category: PluralCategory, numberType: PluralNumberType): string
  /** Inverse of `pluralKeyFor`: split a sibling keypath into base + category + type, else `null`. */
  parsePluralKey?(keypath: string): { baseKey: string; category: PluralCategory; numberType: PluralNumberType } | null
  /** Value-side codec — present iff the plural is encoded in the value (value-locus formats). */
  valueCodec?: PluralValueCodec
}

interface LinkedMessageUtils {
  regex: RegExp
  build: (keypath: string, targetNs?: string) => string
  parse: (ref: string) => { keypath: string; ns?: string }
}

export interface InsertTFunctionTextParams {
  tFunctionInfo: TFunctionInfo
  keypath: string
  params?: Record<string, string>
  quoteType: 'single' | 'double'
  /** Caller-detected wrap need (JSX expression vs Vue template interpolation) — this package has no AST/cursor context of its own. */
  wrapInterpolation?: '{}' | '{{}}'
  /**
   * Plural count argument, set only for plural insertions. `var` is the framework's plural key
   * (`IdeInsertCapability.pluralVar`, e.g. i18next `count`); `expr` is the user's runtime value,
   * defaulting to `var` when the source had no explicit count expression.
   */
  count?: { var: string; expr?: string }
}

interface IdeInsertCapability {
  /** The literal call text to insert, e.g. `t('key', { ns: 'x' })` — no editor/AST access. */
  insertTFunctionText(params: InsertTFunctionTextParams): string
  interpolationWrap: { prefix: string; suffix: string; spacing: string }
  /** The plural count variable name this framework's calls use (i18next `count`, vue `n`). Default `count`. */
  pluralVar?: string
  /** `@:key` / `$t(key)`-style linked-message resolution inside translation values. Not every framework supports it. */
  linkedMessageUtils?: LinkedMessageUtils
}

export interface ResourceDocument {
  /** Raw parsed data tree. */
  data: NestedObject
  /** Serialized file content, preserving original formatting where possible. */
  readonly content: string
  /** Flattened `{ "a.b.c": "value" }` view. */
  readonly flatData: Record<string, string>
  updateValue(keypath: string, newValue: string): void
  deleteKeypath(keypath: string): string | undefined
  renameKeypath(oldKeypath: string, newKeypath: string): void
  /** Empty document mirroring this one's formatting/metadata — for creating a new locale file. */
  cloneEmpty(): ResourceDocument
}

/** Source-text location of a keypath in a resource file — powers in-editor annotations. */
export interface KeypathRange {
  keypath: string
  /** Range in the raw file text, from the key's start to its value's end. */
  loc: Loc
}

export interface ResourceFormat {
  /** Unique id (e.g. `json`, `yaml`). */
  id: string
  /** File extensions this format handles, without the leading dot (e.g. `['json']`). */
  extensions: string[]
  /** Content to parse when a resource file is missing/empty. */
  emptyContent: string
  parse(content: string, sortKeys?: boolean): ResourceDocument
  /**
   * Source-text position of every keypath in raw file content — for in-editor annotations
   * (hover, edit, usages) rendered inside the resource file. Distinct from `parse`, which
   * discards positions. Omit if the format can't report positions; that format simply gets no
   * in-file annotations (never JSON-hardcoded — each format reports its own).
   */
  keypathRanges?(content: string): KeypathRange[]
  /**
   * Message format welded to this storage, when the two are inseparable (Android `plurals.xml`,
   * Fluent `.ftl` selectors). For such
   * formats plural encoding is a storage concern, not a free axis — the resolved config uses
   * this instead of the framework's `messageFormats`. Omit for storage that carries any format
   * transparently (json, yaml).
   */
  messageFormat?: MessageFormat
}
