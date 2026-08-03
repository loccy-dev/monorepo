import { loccyConfigFilename, type LoccyConfig, type ResolvedModule } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { createNodePlatform } from '@repo/node-platform/index'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { LoccyConfigError, readConfigFile } from '@repo/shared/core/loccy-config/loccy-config'
import type { ResourceManager } from '@repo/shared/core/resources/resource-manager'
import { createResourceManager } from '@repo/shared/core/resources/resource-manager'

export interface ModuleOptions {
  module?: string
}

/** Commands that name keys: the namespace is a flag, never something to spell into the key. */
export interface KeyOptions extends ModuleOptions {
  ns?: string
}

/** Everything a command needs to touch one module's translations. */
export interface ModuleContext {
  platform: Platform
  config: LoccyConfig
  module: ResolvedModule
  rm: ResourceManager
}

export function fail(...lines: string[]): never {
  console.error(lines.join('\n'))
  process.exit(1)
}

export function loadPlatform(): Platform {
  return createNodePlatform(process.cwd())
}

/** Exit on a config that exists but doesn't parse or resolve. */
function failConfigError(err: unknown): never {
  if (err instanceof LoccyConfigError) return fail(err.message)
  return fail(`${loccyConfigFilename} could not be read: ${err instanceof Error ? err.message : String(err)}`)
}

/**
 * The project's config, or an exit telling the caller to create it. Auto-detection is deliberately
 * not a fallback here: writing messages against guessed locales and no styleguide is exactly what
 * this tool exists to prevent.
 */
export async function loadConfig(platform: Platform = loadPlatform()): Promise<LoccyConfig> {
  let config: LoccyConfig | null
  try {
    config = await readConfigFile(platform)
  } catch (err) {
    return failConfigError(err)
  }
  if (!config) {
    return fail(
      `No ${loccyConfigFilename}, so there is nothing to read this project's i18n setup from.`,
      `Scaffold it first: loccy-tool init`,
    )
  }
  return config
}

/**
 * The module a command operates on. With one module there is nothing to choose, so it is used
 * unasked; with several, the choice is refused rather than guessed. Guessing writes the right text
 * into the wrong corpus, which reads as success and is only found later.
 * `modules` always holds at least one entry.
 */
function selectModule(config: LoccyConfig, moduleName: string | undefined): ResolvedModule {
  const names = Object.keys(config.modules)

  if (!moduleName) {
    if (names.length > 1) {
      fail(
        `This project has ${names.length} i18n modules: ${names.join(', ')}`,
        `  name the one you mean with --module, e.g. --module ${names[0]}`,
      )
    }
    return config.modules[names[0]!]!
  }

  const module = config.modules[moduleName]
  if (!module) fail(`Module "${moduleName}" not found. Available: ${names.join(', ')}`)
  return module
}

export async function loadModuleContext(options: ModuleOptions): Promise<ModuleContext> {
  const platform = loadPlatform()
  const config = await loadConfig(platform)
  const module = selectModule(config, options.module)
  const rm = await createResourceManager(platform, module)
  if (!rm) {
    fail(`No translation files matched ${module.translations.glob}. Check translations.glob in ${loccyConfigFilename}`)
  }
  return { platform, config, module, rm }
}

/** A key is a bare keypath; the namespace goes in `--ns`. */
export function failOnNamespacedKey(keypath: string): void {
  if (!keypath.includes(':')) return
  fail(`"${keypath}" spells a namespace into the key.`, '  a key is always a bare keypath; the namespace goes in --ns')
}

/**
 * A keypath addressing exactly one message. An empty segment (`auth.`, `auth..title`) would nest
 * under a blank key that no source can reference, so it is rejected rather than written.
 */
export function requireKeypath(keypath: string): string {
  failOnNamespacedKey(keypath)
  if (!keypath.trim()) fail('a key cannot be empty. Write it as segments, e.g. login.title')
  if (keypath.split('.').some((segment) => !segment.trim())) {
    fail(`"${keypath}" has an empty segment. Write dot-separated segments with no blanks, e.g. login.title`)
  }
  return keypath
}

/** The namespaces the files actually hold, which is every one a key can be written into. */
function realNamespaces(ctx: ModuleContext): string[] {
  return ctx.rm.namespaces.filter((ns) => ns !== NS_WITHOUT_NS)
}

/**
 * The namespace a call operates in. `--ns` is the only way to name one, and with more than one to
 * choose from it is required: inferring it from where a keypath already lives cannot answer for a
 * key that does not exist yet, which is exactly when a write is creating it.
 *
 * One namespace per call, not per key, since nothing about a key can change the answer.
 */
export function resolveNamespace(ctx: ModuleContext, options: KeyOptions = {}): string {
  const namespaces = realNamespaces(ctx)

  if (!namespaces.length) {
    if (options.ns) fail(`This project has no namespaces, so --ns "${options.ns}" names nothing.`)
    return ctx.rm.defaultNs
  }

  if (!options.ns) {
    if (namespaces.length === 1) return namespaces[0]!
    return fail(
      `This project has ${namespaces.length} namespaces: ${namespaces.join(', ')}`,
      `  name the one you mean with --ns, e.g. --ns ${namespaces[0]}`,
    )
  }

  if (!namespaces.includes(options.ns)) {
    fail(`Namespace "${options.ns}" not found. Available: ${namespaces.join(', ')}`)
  }
  return options.ns
}

/** A locale the caller named, checked against the ones the translation files actually hold. */
export function requireLocale(ctx: ModuleContext, locale: string): string {
  if (!ctx.rm.allLocales.includes(locale)) {
    fail(`Locale "${locale}" not detected. Available: ${ctx.rm.allLocales.join(', ')}`)
  }
  return locale
}

/** A numeric option's value, refusing anything that would silently degrade into an empty result. */
export function requireCount(raw: string | undefined, flag: string, fallback: number): number {
  if (raw === undefined) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1) fail(`${flag} must be a whole number of 1 or more, got "${raw}"`)
  return value
}

/** The "N more" footer for a list printed under a cap. `flag` is left out where no option raises it. */
export function truncationLine(total: number, limit: number, flag?: string): string | null {
  if (total <= limit) return null
  return `... ${total - limit} more (${total} total)${flag ? `, raise ${flag}` : ''}`
}
