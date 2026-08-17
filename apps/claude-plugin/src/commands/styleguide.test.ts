import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, CONFIG, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

/** The handshake, which every printing of the rules closes on. `<token>` stands for the hash. */
const HANDSHAKE = `
## Writing against these rules

  loccy-tool upsert-message --styleguided <token> <<'EOF'
  {"<keypath>": {"<locale>": "<text>"}}
  EOF

The token above says these rules were read. It is derived from them, not issued per write, so the
same token confirms every write until the rules change. Once you read the full styleguide, pass it always.`

/** The token is a hash of the rules, so it is the one part of this output that cannot be spelled out. */
function withoutToken(out: string): string {
  return out.replace(/--styleguided [0-9a-f]{8}/, '--styleguided <token>')
}

describe('styleguide', () => {
  it('offers to author one where the project has no rules, rather than printing an empty section', async () => {
    baseProject()
    const { out, code } = await run(['styleguide'])

    expect(code).toBe(0)
    expect(out).toBe(`No styleguide in loccy.yaml yet, so nothing constrains the copy beyond the corpus itself.

Match the tone of the existing messages, and offer to author one if the user keeps correcting the
same things: the author-styleguide skill covers it.`)
  })

  it('prints the rules whole, and closes on the write form the token spells', async () => {
    baseProject(`${CONFIG}
styleguide:
  voice: Friendly.
`)
    const { out, code } = await run(['styleguide'])

    expect(code).toBe(0)
    expect(withoutToken(out)).toBe(`# Styleguide, as authored in loccy.yaml

styleguide:
  voice: Friendly.
${HANDSHAKE}`)
  })

  it('prints a styleguide example this very tool reads back, so it cannot drift from the schema', async () => {
    baseProject()
    const example = await run(['styleguide-example'])
    expect(example.code).toBe(0)

    writeProjectFile('loccy.yaml', `${CONFIG}${example.out}`)
    const rendered = await run(['styleguide'])

    // Every field, down the nesting and past the locales this project happens to have: a per-locale
    // glossary override is what a rendering scoped to a write drops.
    expect(withoutToken(rendered.out)).toBe(`# Styleguide, as authored in loccy.yaml

styleguide:
  product: |
    Whisker Café: staff app for a real cat café.
    Used by baristas mid-shift, on a phone, one hand free.
  voice: |
    Warm, lightly cheeky, cat-first. Address the user informally.
    No marketing filler, no fake urgency. Exclamation marks only for genuine surprise.
  mechanics: |
    Buttons and menu labels max ~25 characters.
    No emoji.
  localeRules:
    en: |
      Sentence case for headings and buttons ("Book now" instead of "Book Now").
      Contractions are fine.
    de: |
      Avoid anglicisms when a natural German word exists.
      German runs long: compress rather than truncate.
    de-CH:
      extends: de
      style: |
        Replace ß with ss (schliessen).
        Use Swiss guillemets «…».
  doNotTranslate:
    - term: Whisker Café
      caseSensitive: true
      definition: Café brand name
    - term: Mister Mittens
  glossary:
    - definition: A cat that lives at the café
      terms:
        en: Resident
        de: Bewohner
    - definition: One staff member's working block, opening to closing handover
      terms:
        en: Shift
        de: Schicht
    - definition: A booked seating slot (the booking itself, not the act of reserving)
      terms:
        en: Reservation
        de: Reservierung
        de-CH:
          preferred: Reservation
          deprecated:
            - Buchung
  keys: |
    Group keys by feature, dot-separated ("checkout.button.submit").
${HANDSHAKE}`)
  })
})

describe('a styleguide the schema cannot take', () => {
  const BROKEN = `${CONFIG}
styleguide:
  voice: Friendly.
  glossary:
    - term: Loccy
      de: Loccy
  code: keep keys short
`

  it('names what it dropped and why, and keeps the rules that do load', async () => {
    baseProject(BROKEN)
    const { out, code } = await run(['styleguide'])

    expect(code).toBe(0)
    expect(withoutToken(out)).toBe(`## Styleguide fields ignored

loccy.yaml spells these in a shape the schema cannot take, so they were dropped and
nothing is checked against them. Tell the user, and offer to fix them:

  glossary: 0.definition: Required
  code: renamed to keys

# Styleguide, as authored in loccy.yaml

styleguide:
  voice: Friendly.
${HANDSHAKE}`)
  })

  it('says so at session start, so nothing is written against rules that never loaded', async () => {
    baseProject(BROKEN)
    const { out } = await run(['hook-session-start-debug'], '{}')

    expect(out).toContain(`## Styleguide fields ignored

loccy.yaml spells these in a shape the schema cannot take, so they were dropped and
nothing is checked against them. Tell the user, and offer to fix them:

  glossary: 0.definition: Required
  code: renamed to keys`)
  })

  it('drops an override that extends itself, keeping the locales around it', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules:
    de:
      extends: de
    de-AT:
      extends: de
`)
    const { out } = await run(['styleguide'])

    expect(withoutToken(out)).toBe(`## Styleguide fields ignored

loccy.yaml spells these in a shape the schema cannot take, so they were dropped and
nothing is checked against them. Tell the user, and offer to fix them:

  localeRules.de: "de" cannot extend itself

# Styleguide, as authored in loccy.yaml

styleguide:
  localeRules:
    de-AT:
      extends: de
${HANDSHAKE}`)
  })
})
