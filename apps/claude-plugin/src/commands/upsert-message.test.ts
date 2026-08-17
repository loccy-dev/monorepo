import { chmodSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { baseProject, cleanupProject, CONFIG, de, en, projectPath, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

const STYLEGUIDED = `${CONFIG}
styleguide:
  mechanics: |
    Keep every label under 25 characters.
  doNotTranslate:
    - term: Loccy
`

/** The token the handshake just printed, taken out of the output the way an agent would. */
function tokenFrom(out: string): string {
  const match = out.match(/--styleguided ([0-9a-f]{8})/)
  expect(match, 'the handshake should print a token to confirm with').not.toBeNull()
  return match![1]!
}

/** A project on `config`, and the call carrying its token, so only the terminology checks are left. */
async function styleguided(config: string): Promise<string[]> {
  baseProject(config)
  return ['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)]
}

describe('upsert-message', () => {
  it('writes every locale in one call when no styleguide constrains the copy', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')
    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/{en.json, de.json}')
    expect(en().login.sub).toBe('Welcome')
    expect(de().login.sub).toBe('Willkommen')
  })

  it('points at the rules and writes nothing until the values are confirmed against them', async () => {
    baseProject(STYLEGUIDED)
    const values = '{"login.sub":{"en":"Welcome","de":"Willkommen"}}'

    const first = await run(['upsert-message'], values)
    // A refusal is an answer, not a failure: the exit code says the call ran and reported.
    expect({ code: first.code, crashed: first.crashed }).toEqual({ code: 0, crashed: false })
    // The rules live in that command, so a refusal never reprints them.
    expect(first.out).toBe(`
[nothing written yet] this call carries no --styleguided token.

  loccy-tool styleguide

That prints the rules this project writes by, and the token. Check the values against them,
then rerun with --styleguided <token>.`)
    expect(en().login.sub).toBeUndefined()

    const second = await run(['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)], values)
    expect(second.out).toBe('wrote 1 key to locales/{en.json, de.json}')
    expect(en().login.sub).toBe('Welcome')
    expect(de().login.sub).toBe('Willkommen')
  })

  it('refuses a token issued against a styleguide that has since changed', async () => {
    baseProject(STYLEGUIDED)
    const values = '{"login.sub":{"en":"Welcome","de":"Willkommen"}}'
    const stale = tokenFrom((await run(['styleguide'])).out)

    writeProjectFile('loccy.yaml', `${STYLEGUIDED}    - term: Mittens\n`)

    const after = await run(['upsert-message', '--styleguided', stale], values)
    expect(after.code).toBe(0)
    expect(after.out).toBe(`
[nothing written yet] token ${stale} does not match this project's styleguide as it stands.
Either the rules changed since it was issued, or it came from somewhere else.

  loccy-tool styleguide

That prints the rules this project writes by, and the token. Check the values against them,
then rerun with --styleguided <token>.`)
    expect(en().login.sub).toBeUndefined()

    // The rules as they now stand carry the token that does work.
    const retry = await run(['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)], values)
    expect(retry.out).toBe('wrote 1 key to locales/{en.json, de.json}')
  })

  it('refuses a token that was never issued, rather than taking the word for it', async () => {
    baseProject(STYLEGUIDED)
    const { out, code } = await run(
      ['upsert-message', '--styleguided', 'deadbeef'],
      '{"login.sub":{"en":"W","de":"W"}}',
    )
    expect(code).toBe(0)
    expect(out).toBe(`
[nothing written yet] token deadbeef does not match this project's styleguide as it stands.
Either the rules changed since it was issued, or it came from somewhere else.

  loccy-tool styleguide

That prints the rules this project writes by, and the token. Check the values against them,
then rerun with --styleguided <token>.`)
    expect(en().login.sub).toBeUndefined()
  })

  it('asks for no handshake where the styleguide holds nothing to check a value against', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules: {}
`)
    const { out, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')
    expect({ out, code }).toEqual({ out: 'wrote 1 key to locales/{en.json, de.json}', code: 0 })
  })

  it('writes the locales it is given and leaves the rest as they were', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.title":{"de":"Einloggen"}}')
    expect(code).toBe(0)
    expect(out).toBe(`wrote 1 key to locales/de.json
  hint: copy changed, so a keypath may no longer describe its message. rename-key the ones that drifted`)
    expect(de().login.title).toBe('Einloggen')
    expect(en().login.title).toBe('Sign in')
  })

  it('takes an empty value as a delete, and names the locales the key left', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.ok":{"en":"Continue","de":""}}')
    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/de.json\n  removed login.ok from de')
    expect(de().login.ok).toBeUndefined()
    expect(en().login.ok).toBe('Continue')
  })

  it('says nothing about an empty value for a locale that never held the key', async () => {
    baseProject()
    const { out } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":""}}')
    expect(out).toBe('wrote 1 key to locales/en.json')
  })

  it('reports no change where the files already say exactly this', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.title":{"en":"Sign in","de":"Anmelden"}}')
    expect({ out, code }).toEqual({ out: 'no change: the files already say exactly this for 1 key', code: 0 })
  })

  it('raises the keypath only where copy a key already carried was reworded', async () => {
    baseProject()
    const reworded = await run(['upsert-message'], '{"login.title":{"en":"Log in"}}')
    expect(reworded.out).toBe(`wrote 1 key to locales/en.json
  hint: copy changed, so a keypath may no longer describe its message. rename-key the ones that drifted`)

    const added = await run(['upsert-message'], '{"login.sub":{"en":"Welcome"}}')
    expect(added.out).toBe('wrote 1 key to locales/en.json')
  })

  it('refuses a locale the project does not have, rather than forking the corpus on a typo', async () => {
    baseProject()
    const { err, code, crashed } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen","fr":"Bienvenue"}}',
    )
    expect({ code, crashed }).toEqual({ code: 1, crashed: false })
    expect(err).toBe(`error: login.sub: locale "fr" is not one of this project's: en, de
  adding a locale means adding its translation files and declaring it in loccy.yaml, not writing one message at it`)
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  it('refuses to bury an existing group of messages under a single message', async () => {
    baseProject()
    const { err, code, crashed } = await run(['upsert-message'], '{"login":{"en":"Welcome","de":"Willkommen"}}')
    expect({ code, crashed }).toEqual({ code: 1, crashed: false })
    expect(err).toBe(`error: "login" is a group of 2 message(s), not a message
  login.title
  login.ok
  writing here would delete every one of them, so pick a keypath below this one instead`)
    expect(en().login.title).toBe('Sign in')
  })

  it('writes a whole batch in one call', async () => {
    baseProject()
    const { out } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen"},"login.hint":{"en":"Try again","de":"Nochmal"}}',
    )
    expect(out).toBe('wrote 2 keys to locales/{en.json, de.json}')
    expect(en().login).toMatchObject({ sub: 'Welcome', hint: 'Try again' })
    expect(de().login).toMatchObject({ sub: 'Willkommen', hint: 'Nochmal' })
  })

  it('writes none of a batch when one key fails a guard', async () => {
    baseProject()
    const { err, code } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen"},"login.hint":{"en":"Try again","fr":"Encore"}}',
    )
    expect(code).toBe(1)
    expect(err).toBe(`error: login.hint: locale "fr" is not one of this project's: en, de
  adding a locale means adding its translation files and declaring it in loccy.yaml, not writing one message at it`)
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  // Root ignores the read-only bit, so there would be nothing to roll back to observe.
  it.skipIf(process.getuid?.() === 0)('rolls the whole write back when one locale file cannot be written', async () => {
    baseProject()
    chmodSync(projectPath('locales/de.json'), 0o444)

    const { err, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')

    expect(code).toBe(1)
    expect(err).toMatch(/^error: EACCES: permission denied, open '.*\/locales\/de\.json'$/m)
    expect(err.endsWith('Nothing was written: the batch was rolled back.')).toBe(true)
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  // Placeholders and shared terms read the same in every language, so two locales matching is only
  // ever a copy where one of them is configured to inherit from the other.
  it('takes matching text across separate languages as nothing to report', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.n":{"en":"{n} files","de":"{n} files"}}')
    expect({ out, code }).toEqual({ out: 'wrote 1 key to locales/{en.json, de.json}', code: 0 })
  })

  it('refuses a partial-override locale that repeats the locale it extends', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules:
    de-AT:
      extends: de
`)
    writeProjectFile('locales/de-AT.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { err, code, crashed } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen","de-AT":"Willkommen"}}',
    )
    expect({ code, crashed }).toEqual({ code: 1, crashed: false })
    expect(err).toBe(`error: login.sub: de-AT is a partial override of de and repeats it: "Willkommen"
  a partial-override locale carries its own value only where the text deviates; everywhere else it inherits at runtime, so a copy here is dead weight that goes stale the day the parent changes
  drop de-AT from the JSON`)
    expect(en().login.sub).toBeUndefined()
  })

  it('refuses an override repeating a parent value the files already hold, not only one in the call', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules:
    de-AT:
      extends: de
`)
    writeProjectFile('locales/de-AT.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { err, code } = await run(['upsert-message'], '{"login.title":{"de-AT":"Anmelden"}}')
    expect(code).toBe(1)
    expect(err).toBe(`error: login.title: de-AT is a partial override of de and repeats it: "Anmelden"
  a partial-override locale carries its own value only where the text deviates; everywhere else it inherits at runtime, so a copy here is dead weight that goes stale the day the parent changes
  drop de-AT from the JSON`)
  })

  it('answers an empty call with the locale shapes a write takes and every locale rule', async () => {
    baseProject(`${STYLEGUIDED}  localeRules:
    de: Formal Sie throughout
    de-AT:
      extends: de
      style: Jänner, not Januar
`)
    writeProjectFile('locales/de-AT.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { out, code } = await run(['upsert-message'])

    // The styleguide has one command of its own, so no other prints it.
    expect(code).toBe(0)
    expect(out).toBe(`Values for "default" go in as JSON on stdin, every key you are changing in one call:

  one locale:      {"login.title":{"de":""}}
  primary locales: {"login.title":{"en":"","de":""}}
  all locales:     {"login.title":{"en":"","de":"","de-AT":""}}

Locale rules:

  de
    Formal Sie throughout

Partial overrides, each inheriting unless its text deviates:

  de-AT extends de
    Jänner, not Januar`)
  })

  it('leaves the all-locales shape out where every locale carries its own value', async () => {
    baseProject()
    const { out } = await run(['upsert-message'])
    expect(out).toBe(`Values for "default" go in as JSON on stdin, every key you are changing in one call:

  one locale:      {"login.title":{"de":""}}
  primary locales: {"login.title":{"en":"","de":""}}`)
  })
})

describe('the do-not-translate check', () => {
  const MINIMAL = `${CONFIG}
styleguide:
  doNotTranslate:
    - term: Loccy
`

  /** Every field the entry takes, so the excerpt is seen carrying all of them. */
  const FULL = `${CONFIG}
styleguide:
  doNotTranslate:
    - term: Loccy
      caseSensitive: true
      definition: Product name, never translated or re-cased.
`

  // A term is matched as a plain substring, so an ordinary word of one language can look like one.
  it('refuses a value that dropped the term, and writes the same call repeated', async () => {
    const call = await styleguided(MINIMAL)
    const batch = '{"login.sub":{"en":"Loccy signs you in","de":"Wir melden dich an"}}'

    const refused = await run(call, batch)

    expect(refused.out)
      .toBe(`[nothing written yet] login.sub, de: may break this do-not-translate rule, as authored in loccy.yaml

styleguide:
  doNotTranslate:
    - term: Loccy

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(en().login.sub).toBeUndefined()

    const written = await run(call, batch)
    expect(written.out).toBe('wrote 1 key to locales/{en.json, de.json}')
    expect(en().login.sub).toBe('Loccy signs you in')
  })

  it('weighs the message as it will stand, so a term is not got past one locale per call', async () => {
    const call = await styleguided(MINIMAL)

    const first = await run(call, '{"login.sub":{"en":"Loccy signs you in"}}')
    expect(first.out).toBe('wrote 1 key to locales/en.json')

    const { out } = await run(call, '{"login.sub":{"de":"Wir melden dich an"}}')
    expect(out)
      .toBe(`[nothing written yet] login.sub, de: may break this do-not-translate rule, as authored in loccy.yaml

styleguide:
  doNotTranslate:
    - term: Loccy

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(de().login.sub).toBeUndefined()
  })

  it('takes the same values in another order as the call already answered for', async () => {
    const call = await styleguided(MINIMAL)
    await run(call, '{"login.sub":{"en":"Loccy signs you in","de":"Wir melden dich an"}}')

    const { out } = await run(call, '{"login.sub":{"de":"Wir melden dich an","en":"Loccy signs you in"}}')
    expect(out).toBe('wrote 1 key to locales/{de.json, en.json}')
  })

  it('refuses afresh once the window the first refusal opened has closed', async () => {
    const call = await styleguided(MINIMAL)
    const batch = '{"login.sub":{"en":"Loccy signs you in","de":"Wir melden dich an"}}'
    await run(call, batch)

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000)
      const { out } = await run(call, batch)
      expect(out)
        .toBe(`[nothing written yet] login.sub, de: may break this do-not-translate rule, as authored in loccy.yaml

styleguide:
  doNotTranslate:
    - term: Loccy

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    } finally {
      vi.useRealTimers()
    }
    expect(en().login.sub).toBeUndefined()
  })

  it('prints the rule with every field it was authored with', async () => {
    const call = await styleguided(FULL)
    const batch = '{"login.sub":{"en":"Loccy signs you in","de":"Wir melden dich an"}}'

    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out)
      .toBe(`[nothing written yet] login.sub, de: may break this do-not-translate rule, as authored in loccy.yaml

styleguide:
  doNotTranslate:
    - term: Loccy
      caseSensitive: true
      definition: Product name, never translated or re-cased.

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(en().login.sub).toBeUndefined()
  })
})

describe('the glossary check', () => {
  /** Each locale's term as a plain string, which is the entry at its smallest. */
  const MINIMAL = `${CONFIG}
styleguide:
  glossary:
    - definition: A table booking
      terms:
        en: Reservation
        de: Reservierung
`

  /** Every field the entry takes: the approved form per locale, and the forms it replaced. */
  const FULL = `${CONFIG}
styleguide:
  glossary:
    - definition: A table booking
      terms:
        en:
          preferred: Reservation
          deprecated:
            - Booking
            - Slot
        de:
          preferred: Reservierung
          deprecated:
            - Buchung
`

  /** A term one locale is given a form for and the other is not. */
  const EN_ONLY = `${CONFIG}
styleguide:
  glossary:
    - definition: A table booking
      terms:
        en: Reservation
`

  it('refuses a value that leaves out the term another locale renders by its approved form', async () => {
    const call = await styleguided(MINIMAL)
    const batch = '{"login.sub":{"en":"Reservation confirmed","de":"Tisch bestätigt"}}'

    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out).toBe(`[nothing written yet] login.sub, de: may break this glossary rule, as authored in loccy.yaml

styleguide:
  glossary:
    - definition: A table booking
      terms:
        en: Reservation
        de: Reservierung

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(de().login.sub).toBeUndefined()
  })

  it('refuses a value spelling a term by its deprecated form, printing every field of the rule', async () => {
    const call = await styleguided(FULL)
    const batch = '{"login.sub":{"en":"Booking confirmed","de":"Reservierung bestätigt"}}'

    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out).toBe(`[nothing written yet] login.sub, en: may break this glossary rule, as authored in loccy.yaml

styleguide:
  glossary:
    - definition: A table booking
      terms:
        en:
          preferred: Reservation
          deprecated:
            - Booking
            - Slot
        de:
          preferred: Reservierung
          deprecated:
            - Buchung

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(en().login.sub).toBeUndefined()
  })

  it('names every key and rule the batch tripped, since a refusal is answered in one go', async () => {
    const call = await styleguided(FULL)
    const batch =
      '{"login.sub":{"en":"Booking confirmed","de":"Reservierung bestätigt"},' +
      '"login.hint":{"en":"Reservation held","de":"Tisch reserviert"}}'

    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out).toBe(`[nothing written yet] login.sub, en: may break this glossary rule, as authored in loccy.yaml

styleguide:
  glossary:
    - definition: A table booking
      terms:
        en:
          preferred: Reservation
          deprecated:
            - Booking
            - Slot
        de:
          preferred: Reservierung
          deprecated:
            - Buchung

[nothing written yet] login.hint, de: may break this glossary rule, as authored in loccy.yaml

styleguide:
  glossary:
    - definition: A table booking
      terms:
        en:
          preferred: Reservation
          deprecated:
            - Booking
            - Slot
        de:
          preferred: Reservierung
          deprecated:
            - Buchung

False positives happen: fix the copy, or repeat this exact call to write it as-is.`)
    expect(en().login.sub).toBeUndefined()
    expect(en().login.hint).toBeUndefined()
  })

  it('says nothing about a locale the entry gives no term for', async () => {
    const call = await styleguided(EN_ONLY)
    const batch = '{"login.sub":{"en":"Reservation confirmed","de":"Tisch bestätigt"}}'

    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/{en.json, de.json}')
    expect(en().login.sub).toBe('Reservation confirmed')
    expect(de().login.sub).toBe('Tisch bestätigt')
  })

  it('writes the same call repeated, so a false positive cannot lock the copy out', async () => {
    const call = await styleguided(FULL)
    const batch = '{"login.sub":{"en":"Booking confirmed","de":"Reservierung bestätigt"}}'

    await run(call, batch)
    const { out, code } = await run(call, batch)

    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/{en.json, de.json}')
    expect(en().login.sub).toBe('Booking confirmed')
    expect(de().login.sub).toBe('Reservierung bestätigt')
  })
})
