// Template for initial config.

import { dump } from 'js-yaml'
import type { LayoutPattern, LoccyConfig } from '@repo/types/config.types'
import { LOCCY_HOME, LOCCY_SCHEMA_URL } from '../config'
import { extractFileExt } from '../helpers/path.helpers'
import { frameworkDefaultLayout } from './layout-defaults'
import { getFramework } from '../registry'
import { STYLEGUIDE_EXAMPLE_YAML } from './styleguide-example'

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

/** The example ships commented out: a scaffold to uncomment and adapt, never active rules. */
const STYLEGUIDE_SCAFFOLD = `${STYLEGUIDE_EXAMPLE_YAML.trimEnd()
  .split('\n')
  .map((line) => (line ? `# ${line}` : '#'))
  .join('\n')}\n`

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
    : STYLEGUIDE_SCAFFOLD

  return `${CONFIG_YAML_HEADER}

modules:
${modulesYaml}

${styleguideYaml}`
}
