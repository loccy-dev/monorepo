// Template for initial config.

import { dump } from 'js-yaml'
import type { LayoutPattern, LoccyConfig } from '@repo/types/config.types'
import { LOCCY_DOCS, LOCCY_HOME, LOCCY_SCHEMA_URL } from '../config'
import { extractFileExt } from '../helpers/path.helpers'
import { frameworkDefaultLayout } from './layout-defaults'
import { getFramework } from '../registry'

const CONFIG_YAML_HEADER = `# yaml-language-server: $schema=${LOCCY_SCHEMA_URL}

# Single config for Loccy i18n tools
# ${LOCCY_HOME}`

/** Quote a YAML scalar defensively (globs/patterns contain `*{}`). */
function q(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/** Block-style YAML array, one `- item` per line. */
function block(items: string[], indent: string): string {
  return items.map((item) => `\n${indent}- ${q(item)}`).join('')
}

/** A layout is a plain string in the scaffold; render a map compactly if one is ever passed. */
function renderLayout(layout: LayoutPattern): string {
  return typeof layout === 'string'
    ? q(layout)
    : `{ ${Object.entries(layout)
        .map(([k, v]) => `${q(k)}: ${q(v)}`)
        .join(', ')} }`
}

/** Render one module's body, indented under its `modules.<name>:` key. */
function renderModule(module: LoccyConfig['modules'][string]): string {
  const { framework, usages, translations } = module

  // Emit `layout` only when it differs from the framework's convention — a default layout is
  // re-derived on every run, so spelling it out would just be noise.
  const ext = extractFileExt(translations.glob) || 'json'
  const layoutIsDefault =
    typeof translations.layout === 'string' && translations.layout === frameworkDefaultLayout(framework, ext)
  const layoutLine = layoutIsDefault ? '' : `\n      layout: ${renderLayout(translations.layout)}`
  const sortKeysLine = translations.sortKeys ? `\n      sortKeys: true` : ''
  const translationsExcludeLine = translations.exclude?.length
    ? `\n      exclude:${block(translations.exclude, '        ')}`
    : ''

  // Emit `messageFormat` only when it isn't the framework's default: an omitted value is re-derived
  // by the reader as `messageFormats[0]`, which differs from a deps/weld-resolved format (e.g.
  // react-i18next + i18next-icu → `icu`, not the default `suffix-cldr`). Omitting it would flip
  // plural semantics on the next read.
  const messageFormatIsDefault = translations.messageFormat === getFramework(framework)?.messageFormats[0]
  const messageFormatLine = messageFormatIsDefault ? '' : `\n      messageFormat: ${translations.messageFormat}`

  const usagesExcludeLine = usages.exclude?.length ? `\n      exclude:${block(usages.exclude, '        ')}` : ''
  const customTFunctionsLine = usages.customTFunctions?.length
    ? `\n      customTFunctions:${block(usages.customTFunctions, '        ')}`
    : ''
  const detectKeysInStringsLine = usages.detectKeysInStrings === false ? `\n      detectKeysInStrings: false` : ''

  return `    framework: ${framework}

    translations:
      glob: ${q(translations.glob)}${messageFormatLine}${layoutLine}${sortKeysLine}${translationsExcludeLine}

    usages:
      include:${block(usages.include, '        ')}${usagesExcludeLine}${customTFunctionsLine}${detectKeysInStringsLine}`
}

const STYLEGUIDE_EXAMPLE = `styleguide:
  # TODO: uncomment and adapt:
  # code: |
  #   Group keys by feature, dot-separated ("checkout.button.submit").
  #   Put shared copy under "common." and reuse it — never duplicate a string.
  # global: |
  #   Whisker Café — staff app for a real cat café. Voice: warm, lightly cheeky, cat-first.
  #   Keep the brand "Whisker Café" (with é, U+00E9 — never plain "e") and the mascot
  #   "Mister Mittens" verbatim in every locale.
  #   Never alter placeholders like {name} or {count}, and keep HTML tags (<b>…</b>) intact
  #   and correctly nested.
  #   Buttons and menu labels stay short — max ~25 characters where possible; the layout
  #   has no room for prose.
  #   No emoji, no marketing filler, no fake urgency. Exclamation marks only for genuine surprise.
  # locales:
  #   en: |
  #     US English. Sentence case for headings and buttons ("New reservation"). Contractions are fine.
  #   de: |
  #     Always informal du/dein, never Sie. Avoid anglicisms when a natural
  #     German word exists. German runs long — compress rather than truncate.
  #   de-CH:
  #     extends: de
  #     style: |
  #       Replace ß with ss (schliessen). Use Swiss guillemets «…».
  #       Thousands separator is an apostrophe (1'234.50). Currency as CHF or Fr.
  # doNotTranslate:
  #   - term: Whisker Café
  #     caseSensitive: true
  #     definition: é is U+00E9 — never plain "e"
  #   - term: Mister Mittens
  # glossary:
  #   - definition: A booked seating slot (the booking itself, not the act of reserving)
  #     terms:
  #       en: Reservation
  #       de: Reservierung
  #       de-CH:
  #         preferred: Reservation
  #         deprecated: [Buchung]
`

/** Non-empty check — an all-`undefined` `StyleguideConfig` (e.g. no locales set) still counts as "nothing real to write". */
function hasRealStyleguide(styleguide: LoccyConfig['styleguide']): boolean {
  return !!styleguide && Object.values(styleguide).some((v) => (Array.isArray(v) ? v.length : !!v))
}

export function renderLoccyConfigYaml(config: LoccyConfig): string {
  const modulesYaml = Object.entries(config.modules)
    .map(([name, module]) => `  ${name}:\n${renderModule(module)}`)
    .join('\n\n')

  const styleguideYaml = hasRealStyleguide(config.styleguide)
    ? dump({ styleguide: config.styleguide }, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false })
    : STYLEGUIDE_EXAMPLE

  return `${CONFIG_YAML_HEADER}

modules:
${modulesYaml}

# Styleguide makes AI translations consistent - ${LOCCY_DOCS}/config/#styleguide
${styleguideYaml}`
}
