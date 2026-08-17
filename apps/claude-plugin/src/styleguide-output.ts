import { createHash } from 'node:crypto'
import { loccyConfigFilename, type LoccyConfig } from '@repo/types/config.types'

/** Whether the styleguide says anything at all, which decides between printing it and offering to author it. */
export function hasStyleguideRules(config: LoccyConfig): boolean {
  const styleguide = config.styleguide
  return Boolean(
    styleguide?.keys?.trim() ||
    styleguide?.product?.trim() ||
    styleguide?.voice?.trim() ||
    styleguide?.mechanics?.trim() ||
    Object.keys(styleguide?.localeRules ?? {}).length ||
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
 * The confirmation a write has to carry, hashed from the whole styleguide: unguessable, handed out
 * wherever the rules are printed, and dead the moment they change.
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
 * follow them, which is why nothing but the command printing them in full reaches here.
 */
export function printHandshake(howToRun: string, note?: string): void {
  console.log(`\n## Writing against these rules\n\n${howToRun}\n`)
  console.log('The token above says these rules were read. It is derived from them, not issued per write, so the')
  console.log(
    'same token confirms every write until the rules change. Once you read the full styleguide, pass it always.',
  )
  if (note) console.log(note)
}
