import { renderLoccyConfigYaml } from '@repo/shared/core/loccy-config/config-templates'
import { placeholderConfig } from '@repo/shared/core/loccy-config/initialize-config'
import { LocaleValue, ResolvedModule, StyleguideConfig, partialOverridesOf } from '@repo/types/config.types'
import { cfg } from '../global-config'

/** AI instructions carried over from a legacy `loccy.config.json`, mapped onto the styleguide. */
export interface MigratedStyleguide {
  voice?: string | null
  localeRules?: Record<string, string> | null
  keys?: string | null
}

/** Build the styleguide section from migrated AI instructions plus the current partial-override
 * locales, or undefined when there's nothing real to write. */
function toStyleguide(
  migrated: MigratedStyleguide | undefined,
  currentLocaleRules: Record<string, LocaleValue> | undefined,
): StyleguideConfig | undefined {
  const voice = migrated?.voice?.trim() || undefined
  const keys = migrated?.keys?.trim() || undefined

  const localeRules: Record<string, LocaleValue> = { ...migrated?.localeRules }
  for (const { locale, extends: extendsLocale, style } of partialOverridesOf(currentLocaleRules)) {
    localeRules[locale] = { extends: extendsLocale, style }
  }
  const hasLocaleRules = Object.keys(localeRules).length > 0

  if (!voice && !hasLocaleRules && !keys) {
    return undefined
  }
  return { voice, localeRules: hasLocaleRules ? localeRules : undefined, keys }
}

/**
 * Generate `loccy.yaml` from the resolved config — the whole modules map, same as CLI/shared init
 * (`renderLoccyConfigYaml` already omits runtime-only fields like `quoteType` and re-derivable
 * defaults). Defaults to the current detected config; a legacy-json migration passes its own
 * resolved modules (legacy structural fields merged over detection) instead. Migrating legacy json
 * also writes the carried-over AI instructions as a `styleguide`.
 */
export function generateLoccyConfigYaml(
  migrated?: MigratedStyleguide,
  modules: Record<string, ResolvedModule> = (cfg.resolvedConfig ?? placeholderConfig).modules,
): string {
  return renderLoccyConfigYaml({
    modules,
    styleguide: toStyleguide(migrated, cfg.styleguide?.localeRules),
  })
}
