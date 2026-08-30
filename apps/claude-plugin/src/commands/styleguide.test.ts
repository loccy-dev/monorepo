import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, CONFIG, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

/** What every briefing closes on. `<token>` stands for the hash, which is the rules themselves. */
const RETRY =
  'Check the values against these rules, then repeat the call with --styleguided <token>' +
  ' (same token on every write until the rules change).'

/** The headline a write with no token is answered with. */
const HEADLINE = '[nothing written yet] the rules this project writes by, as authored in loccy.yaml.'

/**
 * The rules reach a session as the answer to a write, so a write is how they are asked for. The
 * config is named by its full path, which a throwaway project only knows at run time.
 */
async function briefing(): Promise<{ out: string; code: number; crashed: boolean }> {
  const result = await run(['upsert-message'], '{"login.sub":{"en":"Welcome"}}')
  return {
    ...result,
    out: result.out
      .replace(/Full entries: \S+/, 'Full entries: <project>/loccy.yaml')
      .replace(/--styleguided [0-9a-f]{8}/, '--styleguided <token>'),
  }
}

describe('the styleguide briefing', () => {
  it('says nothing where the project has no rules, rather than printing an empty section', async () => {
    baseProject()
    const { out, code } = await briefing()

    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/en.json')
  })

  it('prints the rules whole, and closes on the call that writes them', async () => {
    baseProject(`${CONFIG}
styleguide:
  voice: Friendly.
`)
    const { out, code } = await briefing()

    expect(code).toBe(0)
    expect(out).toBe(`${HEADLINE}

styleguide:
  voice: Friendly.

${RETRY}`)
  })

  it('renders a styleguide example this very tool reads back, so it cannot drift from the schema', async () => {
    baseProject()
    const example = await run(['styleguide-example'])
    expect(example.code).toBe(0)

    writeProjectFile('loccy.yaml', `${CONFIG}${example.out}`)
    const { out } = await briefing()

    // Every prose field down the nesting, then every governed term on a line of its own: the
    // per-locale forms and the deprecated spellings are what the one-line rendering leaves behind.
    expect(out).toBe(`${HEADLINE}

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
  keys: |
    Group keys by feature, dot-separated ("checkout.button.submit").

## Terminology

  Resident: A cat that lives at the café
  Shift: One staff member's working block, opening to closing handover
  Reservation: A booked seating slot (the booking itself, not the act of reserving)
  Whisker Café (never translated): Café brand name
  Mister Mittens (never translated)

Full entries: <project>/loccy.yaml

${RETRY}`)
  })
})

describe('a term with no form in the locales that carry their own value', () => {
  it('names an entry by the most widely spoken locale it has a form for', async () => {
    baseProject(`${CONFIG}
styleguide:
  glossary:
    - definition: One staff member's working block
      terms:
        de: Schicht
    - definition: A cat that lives at the café
      terms:
        en: Resident
        de: Bewohner
`)
    const { out } = await briefing()

    // English outranks German where the entry has both, and stands aside where it has no form at all.
    expect(out).toBe(`${HEADLINE}

## Terminology

  Schicht: One staff member's working block
  Resident: A cat that lives at the café

Full entries: <project>/loccy.yaml

${RETRY}`)
  })

  it('passes over an entry no locale of this project has a form for', async () => {
    baseProject(`${CONFIG}
styleguide:
  voice: Friendly.
  glossary:
    - definition: A booked seating slot
      terms:
        fr: Réservation
`)
    const { out } = await briefing()

    expect(out).toBe(`${HEADLINE}

styleguide:
  voice: Friendly.

${RETRY}`)
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
    const { out, code } = await briefing()

    expect(code).toBe(0)
    expect(out).toBe(`${HEADLINE}

## Styleguide fields ignored

loccy.yaml spells these in a shape the schema cannot take, so they were dropped and
nothing is checked against them. Tell the user, and offer to fix them:

  glossary: 0.definition: Required
  code: renamed to keys

styleguide:
  voice: Friendly.

${RETRY}`)
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
    const { out } = await briefing()

    expect(out).toBe(`${HEADLINE}

## Styleguide fields ignored

loccy.yaml spells these in a shape the schema cannot take, so they were dropped and
nothing is checked against them. Tell the user, and offer to fix them:

  localeRules.de: "de" cannot extend itself

styleguide:
  localeRules:
    de-AT:
      extends: de

${RETRY}`)
  })
})
