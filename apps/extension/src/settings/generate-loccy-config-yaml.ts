import { renderLoccyConfigYaml } from '@repo/shared/core/loccy-config/config-templates'
import { placeholderConfig } from '@repo/shared/core/loccy-config/initialize-config'
import { LocaleValue, StyleguideConfig, partialOverridesOf } from '@repo/types/config.types'
import { cfg } from '../global-config'

/** AI instructions carried over from a legacy `loccy.config.json`, mapped onto the styleguide. */
export interface MigratedStyleguide {
  global?: string | null
  locales?: Record<string, string> | null
  code?: string | null
}

/** Build the styleguide section from migrated AI instructions plus the current partial-override
 * locales, or undefined when there's nothing real to write. */
function toStyleguide(
  migrated: MigratedStyleguide | undefined,
  currentLocales: Record<string, LocaleValue> | undefined,
): StyleguideConfig | undefined {
  const global = migrated?.global?.trim() || undefined
  const code = migrated?.code?.trim() || undefined

  const locales: Record<string, LocaleValue> = { ...migrated?.locales }
  for (const { locale, extends: extendsLocale, style } of partialOverridesOf(currentLocales)) {
    locales[locale] = { extends: extendsLocale, style }
  }
  const hasLocales = Object.keys(locales).length > 0

  if (!global && !hasLocales && !code) {
    return undefined
  }
  return { code, global, locales: hasLocales ? locales : undefined }
}

/**
 * Generate `loccy.yaml` from the resolved config — the whole modules map, same as CLI/shared init
 * (`renderLoccyConfigYaml` already omits runtime-only fields like `quoteType` and re-derivable
 * defaults). Migrating legacy json also writes the carried-over AI instructions as a `styleguide`.
 */
export function generateLoccyConfigYaml(migrated?: MigratedStyleguide): string {
  return renderLoccyConfigYaml({
    modules: (cfg.resolvedConfig ?? placeholderConfig).modules,
    styleguide: toStyleguide(migrated, cfg.styleguide?.locales),
  })
}
