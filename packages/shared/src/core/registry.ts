// Registry of the i18n frameworks, message formats, and resource formats. Import this
// module (directly or transitively) to get them registered — registration is a side
// effect of the imports below.

import type { MessageFormatId, ResolvedModule } from '@repo/types/config.types'
import { NS_WITHOUT_NS } from './helpers/namespace.helpers'
import type { I18nFrameworkId } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import { MAX_RESOURCE_FILE_SIZE } from './config'
import type { I18nFramework, MessageFormat, ResourceFormat, ResourceDocument } from './contracts'
import { jsonResourceFormat } from './resources/json-parser'
import { yamlResourceFormat } from './resources/yaml-parser'
import { tsObjectResourceFormat } from './resources/ts-object-parser'
import { phpArrayResourceFormat } from './resources/php-array-parser'
import { propertiesResourceFormat } from './resources/properties-parser'
import { suffixCldrMessageFormat } from './message-formats/suffix-cldr'
import { icuMessageFormat } from './message-formats/icu'
import { vuePipeMessageFormat } from './message-formats/vue-pipe'
import { choicePipeMessageFormat } from './message-formats/choice-pipe'
import { vueI18nFramework } from './frameworks/vue-i18n'
import { reactI18nextFramework } from './frameworks/react-i18next'
import { nextIntlFramework } from './frameworks/next-intl'
import { laravelFramework } from './frameworks/laravel'
import { springFramework } from './frameworks/spring'
import { customFramework } from './frameworks/custom'

/** Frameworks temporarily withheld from users pending the multi-source storage redesign (see
 * `plans/`). They stay registered (code + tests intact) but are never declared in the schema,
 * auto-detected, or accepted from config. Re-enable by clearing this set + widening
 * `ActiveFrameworkId`. */
export const DISABLED_FRAMEWORK_IDS: ReadonlySet<I18nFrameworkId> = new Set(['laravel', 'spring'])

const frameworks = new Map<string, I18nFramework>()
const messageFormats = new Map<string, MessageFormat>()
const resourceFormats = new Map<string, ResourceFormat>()
const resourceFormatsByExt = new Map<string, ResourceFormat>()

function registerFramework(framework: I18nFramework): void {
  frameworks.set(framework.id, framework)
}

export function getFramework(id: string): I18nFramework | undefined {
  return frameworks.get(id)
}

/** Resolve a framework by id, falling back to `custom` for unregistered/bogus ids. */
export function getFrameworkOrCustom(id: string): I18nFramework {
  return getFramework(id) ?? customFramework
}

export function listFrameworks(): I18nFramework[] {
  return [...frameworks.values()]
}

/** First registered, non-disabled framework whose `detectFromDeps` matches — registration order is priority order. */
export function detectFrameworkFromDeps(allDeps: Set<string>): I18nFrameworkId | undefined {
  for (const framework of frameworks.values()) {
    if (!DISABLED_FRAMEWORK_IDS.has(framework.id) && framework.detectFromDeps(allDeps)) {
      return framework.id
    }
  }
  return undefined
}

function registerMessageFormat(messageFormat: MessageFormat): void {
  messageFormats.set(messageFormat.id, messageFormat)
}

export function getMessageFormat(id: string): MessageFormat | undefined {
  return messageFormats.get(id)
}

export function listMessageFormats(): MessageFormat[] {
  return [...messageFormats.values()]
}

/** The message-format id for a framework: a welded resource format wins, else the framework decides (or its first declared format). */
export function resolveMessageFormatId(
  framework: I18nFramework,
  allDeps: Set<string>,
  resourceFormat?: ResourceFormat,
): MessageFormatId {
  if (resourceFormat?.messageFormat) return resourceFormat.messageFormat.id
  return framework.resolveMessageFormat?.(allDeps) ?? framework.messageFormats[0]!
}

/** The active `MessageFormat` for a resolved module (its already-resolved `messageFormat`). */
export function resolveActiveMessageFormat(module: ResolvedModule): MessageFormat {
  return getMessageFormat(module.translations.messageFormat) ?? icuMessageFormat
}

/** A module's matched translation files, resolved framework, and resolved default namespace. */
/** A module's default namespace: explicit `usages.defaultNamespace`, else framework detection over
 *  its files (detection failure → the no-namespace sentinel). The single rule CLI + IDE both use. */
export async function resolveModuleDefaultNs(
  platform: Platform,
  module: ResolvedModule,
  files: string[],
): Promise<string> {
  if (module.usages.defaultNamespace) {
    return module.usages.defaultNamespace
  }
  try {
    return await getFrameworkOrCustom(module.framework).detectDefaultNs(platform, files)
  } catch {
    return NS_WITHOUT_NS
  }
}

export async function resolveModuleTranslations(
  platform: Platform,
  module: ResolvedModule,
): Promise<{ files: string[]; defaultNs: string }> {
  const files = await platform.findFiles([module.translations.glob], module.translations.exclude ?? [])
  const defaultNs = await resolveModuleDefaultNs(platform, module, files)
  return { files, defaultNs }
}

function registerResourceFormat(format: ResourceFormat): void {
  resourceFormats.set(format.id, format)
  for (const ext of format.extensions) {
    resourceFormatsByExt.set(ext, format)
  }
}

export function getResourceFormatByExt(ext: string): ResourceFormat | undefined {
  return resourceFormatsByExt.get(ext)
}

/** Parse resource file content via its resource format, guarding against oversized files first — format-agnostic, applies before any format-specific parsing runs. */
export function parseResourceFile(format: ResourceFormat, content: string, sortKeys?: boolean): ResourceDocument {
  if (new TextEncoder().encode(content).length > MAX_RESOURCE_FILE_SIZE) {
    throw new Error(`${format.id} resource file too large`)
  }
  return format.parse(content, sortKeys)
}

export function listResourceFormats(): ResourceFormat[] {
  return [...resourceFormats.values()]
}

// --- registrations ---
// Ordered id → definition maps. `satisfies Record<Id, …>` ties each registry to its closed union
// in @repo/types: a missing or unknown id is a compile error, so type and registrations can't drift.
// Framework key order is auto-detection priority.

const frameworksById = {
  'next-intl': nextIntlFramework,
  'vue-i18n': vueI18nFramework,
  'react-i18next': reactI18nextFramework,
  laravel: laravelFramework,
  spring: springFramework,
  custom: customFramework,
} satisfies Record<I18nFrameworkId, I18nFramework>

const messageFormatsById = {
  'suffix-cldr': suffixCldrMessageFormat,
  icu: icuMessageFormat,
  'vue-pipe': vuePipeMessageFormat,
  'choice-pipe': choicePipeMessageFormat,
} satisfies Record<MessageFormatId, MessageFormat>

for (const framework of Object.values(frameworksById)) registerFramework(framework)
for (const messageFormat of Object.values(messageFormatsById)) registerMessageFormat(messageFormat)

registerResourceFormat(jsonResourceFormat)
registerResourceFormat(yamlResourceFormat)
registerResourceFormat(tsObjectResourceFormat)
registerResourceFormat(phpArrayResourceFormat)
registerResourceFormat(propertiesResourceFormat)
