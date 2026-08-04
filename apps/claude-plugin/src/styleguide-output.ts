import { createHash } from 'node:crypto'
import { loccyConfigFilename, partialOverridesOf, type LoccyConfig } from '@repo/types/config.types'
import { resolveLocalizationGuidance } from '@repo/shared/utils/styleguide/localization-guidance'
import { localeProse } from '@repo/shared/utils/styleguide/styleguide-prompt'

/** Whether the styleguide says anything at all, which decides between printing it and offering to author it. */
export function hasStyleguideRules(config: LoccyConfig): boolean {
  const styleguide = config.styleguide
  return Boolean(
    styleguide?.keys?.trim() ||
    styleguide?.product?.trim() ||
    styleguide?.voice?.trim() ||
    styleguide?.mechanics?.trim() ||
    styleguide?.localeRules ||
    styleguide?.doNotTranslate?.length ||
    styleguide?.glossary?.length,
  )
}

/** Rules the config could not load. Nothing else reports them, so the styleguide reads as complete. */
export function droppedStyleguideNote(config: LoccyConfig): string | null {
  const dropped = config.droppedStyleguideFields
  if (!dropped?.length) return null

  return [
    '## Styleguide fields ignored',
    '',
    `${loccyConfigFilename} spells these in a shape the schema cannot take, so they were dropped and`,
    'nothing is checked against them. Tell the user, and offer to fix them:',
    '',
    ...dropped.map(({ field, reason }) => `  ${field}: ${reason}`),
  ].join('\n')
}

const EMPTY_STYLEGUIDE_NOTE =
  'The styleguide is empty, so nothing here constrains the copy. The author-styleguide skill covers filling it in.'

/** Stands in for `styleguide.keys` wherever the rules are shown and the project has not written any. */
const NO_KEY_GUIDELINES = 'None. Follow the key naming the corpus already uses (`loccy-tool search`).'

/** Product, voice and mechanics, each locale's rules, the declared terms, and every override in view. */
function printWritingRules(config: LoccyConfig, targetLocales: string[]): void {
  // An override's rule only resolves while the locale it extends is in view, so asking for `de-CH`
  // on its own has to bring `de` along or the one rule that governs it would go missing.
  const parents = partialOverridesOf(config.styleguide?.localeRules)
    .filter((override) => targetLocales.includes(override.locale))
    .map((override) => override.extends)

  const { styleguideText, regionalOverrides } = resolveLocalizationGuidance(config.styleguide, targetLocales, parents)

  if (styleguideText) console.log(styleguideText)

  for (const override of regionalOverrides ?? []) {
    console.log(`\n## localeRules.${override.locale} (extends ${override.extends})`)
    console.log(override.rule.trim() || `no documented deviation from ${override.extends}`)
    if (override.parentStyle) console.log(`\n${override.extends} style: ${override.parentStyle}`)
  }

  if (!styleguideText && !regionalOverrides?.length) console.log(EMPTY_STYLEGUIDE_NOTE)
}

/**
 * Partial-override locales that are not in view, and what each inherits. An override among the
 * target locales already had its rule printed with the writing rules, so repeating it here would
 * only say the same thing twice.
 */
function printInheritedOverrides(config: LoccyConfig, allLocales: string[], targetLocales: string[]): void {
  const omitted = partialOverridesOf(config.styleguide?.localeRules).filter(
    (override) => allLocales.includes(override.locale) && !targetLocales.includes(override.locale),
  )
  if (!omitted.length) return

  console.log('\n## Partial-override locales not in view')
  console.log('Each inherits its parent unless the text genuinely deviates. Include one only in that case.')

  for (const override of omitted) {
    const parentProse = localeProse({ styleguide: config.styleguide }, override.extends)
    console.log(`\n### localeRules.${override.locale} extends ${override.extends}`)
    console.log(
      `deviates only where: ${override.style?.trim() || 'no rule documented, so treat any deviation as suspect'}`,
    )
    if (parentProse) console.log(`${override.extends} style: ${parentProse}`)
  }
}

/**
 * The styleguide as one write is checked against it: narrowed to `targetLocales`, with overrides
 * outside them reported as inherited. Lossy by design; the `styleguide` command prints it whole.
 */
export function printStyleguide(config: LoccyConfig, allLocales: string[], targetLocales: string[]): void {
  console.log('## keys\n')
  console.log(config.styleguide?.keys?.trim() || NO_KEY_GUIDELINES)

  console.log('')
  printWritingRules(config, targetLocales)
  printInheritedOverrides(config, allLocales, targetLocales)
}

/** Key order in the file is not a rule change, so the token is taken from the shape, not the text. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * The confirmation a write has to carry, hashed from the whole styleguide: unguessable, shared by
 * every command that prints the rules, and dead the moment they change.
 */
export function styleguideToken(config: LoccyConfig): string {
  return createHash('sha256')
    .update(stableStringify(config.styleguide ?? {}))
    .digest('hex')
    .slice(0, 8)
}

/** The confirmation flag, spelled with this project's current token. */
export function styleguidedFlag(config: LoccyConfig): string {
  return `--styleguided ${styleguideToken(config)}`
}

/**
 * The one place the confirmation is named. It certifies the rules were read, so it may only ever
 * follow them: every path that prints the styleguide ends here, which is what keeps that true.
 */
export function printHandshake(howToRun: string, note?: string): void {
  console.log(`\n## Writing against these rules\n\n${howToRun}\n`)
  console.log('The token above says these rules were read. It is derived from them, not issued per write, so the')
  console.log(
    'same token confirms every write until the rules change. Once you read the full styleguide, pass it always.',
  )
  if (note) console.log(note)
}
