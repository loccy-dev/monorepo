import type { Platform } from '@repo/types/platform.types'
import type {
  DroppedStyleguideField,
  LoccyConfig,
  ResolvedModule,
  StyleguideConfig,
  PartialModuleConfig,
  PartialLoccyConfig,
} from '@repo/types/config.types'
import { loccyConfigFilename, partialOverridesOf } from '@repo/types/config.types'
import { load } from 'js-yaml'
import { z } from 'zod'
import { initializeConfig, placeholderConfig } from './initialize-config'
import { doNotTranslateSchema, glossarySchema } from '../../utils/styleguide/glossary-schema'
import {
  activeFrameworkIds,
  DISABLED_FRAMEWORK_IDS,
  getFramework,
  getMessageFormat,
  listMessageFormats,
} from '../registry'
import { extractFileExt } from '../helpers/path.helpers'
import { frameworkDefaultLayout } from './layout-defaults'

export class LoccyConfigError extends Error {
  constructor(message: string) {
    super(`[loccy.config] ${message}`)
    this.name = 'LoccyConfigError'
  }
}

const localeValueSchema = z.union([
  z.string(),
  z.object({
    extends: z.string(),
    style: z.string().optional(),
  }),
])

/** One schema per field, so a field that fails to parse is dropped without the rest going with it. */
const styleguideFieldSchemas = new Map<string, z.ZodTypeAny>([
  ['product', z.string()],
  ['voice', z.string()],
  ['mechanics', z.string()],
  ['localeRules', z.record(z.string(), localeValueSchema)],
  ['doNotTranslate', doNotTranslateSchema],
  ['glossary', glossarySchema],
  ['keys', z.string()],
])

/** Styleguide fields from before the split by scope, and what became of each. */
const DEPRECATED_STYLEGUIDE_FIELDS: Record<string, string> = {
  code: 'renamed to keys',
  global: 'split into product, voice and mechanics, by what each rule is about',
  locales: 'renamed to localeRules',
}

function firstIssueIn(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'does not match the schema'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

/**
 * The styleguide, with anything the schema cannot take left out rather than refused: a hard stop
 * takes every tool down over one hand-authored field. What was dropped is reported for migration.
 */
function parseStyleguide(raw: unknown): { styleguide: StyleguideConfig; dropped: DroppedStyleguideField[] } {
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      styleguide: {},
      dropped: [{ field: 'styleguide', reason: 'must be a block of rules, not a single value' }],
    }
  }

  const styleguide: Record<string, unknown> = {}
  const dropped: DroppedStyleguideField[] = []

  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value == null) continue

    const schema = styleguideFieldSchemas.get(field)
    if (!schema) {
      dropped.push({ field, reason: DEPRECATED_STYLEGUIDE_FIELDS[field] ?? 'not a styleguide field' })
      continue
    }

    const parsed = schema.safeParse(value)
    if (parsed.success) styleguide[field] = parsed.data
    else dropped.push({ field, reason: firstIssueIn(parsed.error) })
  }

  return { styleguide: styleguide as StyleguideConfig, dropped }
}

const DEFAULT_MODULE = 'default'

/** Resolve one module. `base` (detected/placeholder) only fills gaps for a config-less bootstrap — an explicit `modules:` entry is authoritative. */
function resolveModule(name: string, user: PartialModuleConfig, base: ResolvedModule | undefined): ResolvedModule {
  const frameworkId = user.framework ?? base?.framework ?? 'custom'
  const framework = getFramework(frameworkId)
  const known = activeFrameworkIds().join(', ')
  if (!framework) {
    throw new LoccyConfigError(`modules.${name}.framework must be a registered framework id (known: ${known})`)
  }
  if (DISABLED_FRAMEWORK_IDS.has(frameworkId)) {
    throw new LoccyConfigError(
      `modules.${name}.framework "${frameworkId}" is temporarily unsupported — supported: ${known}`,
    )
  }

  // `glob` is the one field that can't be derived (only the filesystem knows where translations live).
  // A module absent from an explicit `modules:` block (bootstrap) may inherit it from detection via `base`.
  const glob = user.translations?.glob ?? base?.translations.glob
  if (!glob) {
    throw new LoccyConfigError(
      `modules.${name}.translations.glob is required — the glob for this module's translation files (e.g. "src/locales/**/*.json")`,
    )
  }
  const layout =
    user.translations?.layout ??
    base?.translations.layout ??
    frameworkDefaultLayout(frameworkId, extractFileExt(glob) || 'json')

  // Message format: user override, else the base's resolved format when the framework wasn't
  // overridden (a base format belongs to the base's framework), else the framework's default.
  // Deps-based resolution (e.g. i18next-icu → icu) happens in `initializeConfig` → `base`.
  const frameworkOverridden = !!user.framework && !!base && user.framework !== base.framework
  const messageFormat =
    user.translations?.messageFormat ??
    (base && !frameworkOverridden ? base.translations.messageFormat : undefined) ??
    framework.messageFormats[0]!
  if (!getMessageFormat(messageFormat)) {
    const known = listMessageFormats()
      .map((messageFormat) => messageFormat.id)
      .join(', ')
    throw new LoccyConfigError(
      `modules.${name}.translations.messageFormat must be a registered message-format id (known: ${known})`,
    )
  }

  const usages: ResolvedModule['usages'] = {
    // A module that declares no `usages` is translations-only — leave `include` empty (usage scanning
    // + usage-based lint skip it) rather than borrowing the placeholder default. The default module
    // still gets usages (its `base` is the detected/placeholder config), so single-setup repos scan.
    include: user.usages?.include?.length ? user.usages.include : (base?.usages.include ?? []),
    exclude: user.usages?.exclude ?? base?.usages.exclude ?? [],
    customTFunctions: user.usages?.customTFunctions ?? base?.usages.customTFunctions ?? [],
    detectKeysInStrings: user.usages?.detectKeysInStrings ?? base?.usages.detectKeysInStrings ?? true,
    quoteType: user.usages?.quoteType ?? base?.usages.quoteType,
    defaultNamespace: user.usages?.defaultNamespace ?? base?.usages.defaultNamespace,
    // Usage-side lint rules (co-located with the axis they check). Default on.
    noUnresolvedKeys: user.usages?.noUnresolvedKeys ?? base?.usages.noUnresolvedKeys ?? true,
    noUnusedKeys: user.usages?.noUnusedKeys ?? base?.usages.noUnusedKeys ?? true,
  }

  return {
    name,
    framework: frameworkId,
    usages,
    translations: {
      messageFormat,
      glob,
      layout,
      exclude: user.translations?.exclude ?? base?.translations.exclude ?? [],
      // Storage-side lint rules (co-located). `noUntranslatedKeys`/`checkPlurals` on by default, `sortKeys` off.
      noUntranslatedKeys: user.translations?.noUntranslatedKeys ?? base?.translations.noUntranslatedKeys ?? true,
      checkPlurals: user.translations?.checkPlurals ?? base?.translations.checkPlurals ?? true,
      sortKeys: user.translations?.sortKeys ?? base?.translations.sortKeys ?? false,
    },
  }
}

/** An explicit `modules:` block is authoritative and skips gap-filling/detection; its absence means config-less/module-less bootstrap. */
function hasExplicitModules(user: PartialLoccyConfig): boolean {
  return !!user.modules && Object.keys(user.modules).length > 0
}

/** Resolve the user's config into fully-typed modules — a config-less/module-less file bootstraps from `detected`, an explicit `modules:` block never does. */
export function resolveConfig(user: PartialLoccyConfig, detected: LoccyConfig | null): LoccyConfig {
  const usesExplicitModules = hasExplicitModules(user)
  // Explicit modules get no placeholder gap-filling; a config-less bootstrap may.
  const base = detected ?? (usesExplicitModules ? null : placeholderConfig)
  const userModules = usesExplicitModules ? user.modules! : { [DEFAULT_MODULE]: {} }

  const modules: Record<string, ResolvedModule> = {}
  for (const [name, userModule] of Object.entries(userModules)) {
    modules[name] = resolveModule(name, userModule, base?.modules[name])
  }

  // A `styleguide:` key whose fields are all commented out parses to `null`, not absent — treat it
  // the same as omitted.
  const authored = user.styleguide != null ? parseStyleguide(user.styleguide) : null
  const styleguide = authored ? authored.styleguide : base?.styleguide
  const dropped = [...(authored?.dropped ?? []), ...pruneBrokenOverrides(styleguide)]

  return { modules, styleguide, droppedStyleguideFields: dropped.length ? dropped : undefined }
}

function brokenOverrideReason(locale: string, extendsLocale: string): string | null {
  if (!locale || !extendsLocale) return 'a partial override needs both a locale key and `extends`'
  if (locale === extendsLocale) return `"${locale}" cannot extend itself`
  return null
}

/** Broken overrides are dropped, not refused, so the rules around them still load. */
function pruneBrokenOverrides(styleguide: StyleguideConfig | undefined): DroppedStyleguideField[] {
  const rules = styleguide?.localeRules
  if (!rules) return []

  const dropped: DroppedStyleguideField[] = []
  for (const { locale, extends: extendsLocale } of partialOverridesOf(rules)) {
    const reason = brokenOverrideReason(locale, extendsLocale)
    if (!reason) continue
    dropped.push({ field: `localeRules.${locale}`, reason })
    delete rules[locale]
  }
  return dropped
}

/** Read `loccy.yaml` and resolve it. Auto-detection bootstraps a config-less/module-less file; an explicit `modules:` block is authoritative (no gap-filling). */
export async function readConfigFile(
  platform: Platform,
  configPath: string = loccyConfigFilename,
): Promise<LoccyConfig | null> {
  if (!(await platform.exists(configPath))) {
    return null
  }

  const content = await platform.readFile(configPath)
  let parsed: unknown
  try {
    parsed = load(content)
  } catch (e) {
    throw new LoccyConfigError(`failed to parse ${configPath}: ${(e as Error).message}`)
  }
  // an empty or all-comments file parses to `undefined` — that's "detect everything", not malformed
  if (parsed === undefined || parsed === null) {
    parsed = {}
  } else if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new LoccyConfigError(`${configPath} must be a YAML object`)
  }
  const user = parsed as PartialLoccyConfig

  const detected = hasExplicitModules(user) ? null : await initializeConfig(platform)
  return resolveConfig(user, detected)
}

/** Read the config file, falling back to auto-detection when no file exists — for tools that should work without a committed `loccy.yaml`. */
export async function readConfigOrDetect(platform: Platform): Promise<LoccyConfig | null> {
  return (await readConfigFile(platform)) ?? (await initializeConfig(platform))
}

/**
 * The config narrowed to one module, or null when nothing declares it. Every run-wide command works
 * off `config.modules`, so scoping one is narrowing that map rather than threading a name through
 * each of them.
 */
export function withOnlyModule(config: LoccyConfig, name: string): LoccyConfig | null {
  const module = config.modules[name]
  return module ? { ...config, modules: { [name]: module } } : null
}
