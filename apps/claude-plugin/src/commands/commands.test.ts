import { chmodSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  baseProject,
  cleanupProject,
  CONFIG,
  linkedProject,
  makeProject,
  namespacedProject,
  projectPath,
  readProjectFile,
  run,
  writeProjectFile,
} from './harness'

afterEach(cleanupProject)

const STYLEGUIDED = `${CONFIG}
styleguide:
  mechanics: |
    Keep every label under 25 characters.
  doNotTranslate:
    - term: Loccy
`

const en = () => JSON.parse(readProjectFile('locales/en.json'))
const de = () => JSON.parse(readProjectFile('locales/de.json'))
const source = () => readProjectFile('src/app.ts')

/** The token the handshake just printed, taken out of the output the way an agent would. */
function tokenFrom(out: string): string {
  const match = out.match(/--styleguided ([0-9a-f]{8})/)
  expect(match, 'the handshake should print a token to confirm with').not.toBeNull()
  return match![1]!
}

describe('reading', () => {
  it('shows the session start briefing as text, exactly as the harness is handed it', async () => {
    baseProject()
    const real = await run(['hook-session-start'], '{}')
    const context = JSON.parse(real.out).hookSpecificOutput.additionalContext

    expect(context).toContain('## This project')
    // Escaped in the payload, broken where the prose breaks in the debug view, same text in both.
    expect((await run(['hook-session-start-debug'], '{}')).out).toContain(context)
  })

  it('shows a key in every locale', async () => {
    baseProject()
    const { out } = await run(['search', 'Sign in'])
    expect(out).toContain('en: Sign in')
    expect(out).toContain('de: Anmelden')
  })

  it('searches values and reports an honest miss', async () => {
    baseProject()
    expect((await run(['search', 'Anmelden'])).out).toContain('keypath: login.title')
    expect((await run(['search', 'nothinghere'])).out).toContain('No matches')
  })

  it('leaves keypaths to --key, so a word searched as text finds only messages that say it', async () => {
    baseProject()
    expect((await run(['search', 'login.title'])).out).toContain('No matches')

    const byKey = await run(['search', '--key', 'login.title'])
    expect(byKey.out).toContain('1 match for keys matching "login.title"')
    expect(byKey.out).toContain('en: Sign in')
  })

  it('matches a group under --key, so a whole subtree is read in one call', async () => {
    baseProject()
    const { out } = await run(['search', '--key', 'login.'])
    expect(out).toContain('2 matches for keys matching "login."')
  })

  it('narrows a text query by keypath when given both, rather than matching either', async () => {
    baseProject()
    const both = await run(['search', 'Sign in', '--key', 'login.title'])
    expect(both.out).toContain('1 match for "Sign in" and keys matching "login.title"')

    // The text is there and the key exists, but not on the same message.
    const disjoint = await run(['search', 'Sign in', '--key', 'login.ok'])
    expect(disjoint.out).toContain('No matches')
  })

  it('reads every query as a pattern, and refuses one that does not compile', async () => {
    baseProject()
    const matched = await run(['search', '^Sign', '--key', 'title$'])
    expect(matched.out).toContain('keypath: login.title')

    // A glob is not a pattern, and saying so beats answering with an empty result.
    const glob = await run(['search', '--key', '*title*'])
    expect(glob.code).toBe(1)
    expect(glob.err).toContain('not a valid regular expression')
  })

  it('matches a phrase out of the UI once its pattern characters are escaped', async () => {
    baseProject()
    await run(['upsert-message'], '{"login.ask":{"en":"Are you sure? (optional)","de":"Sicher? (optional)"}}')

    const escaped = await run(['search', 'Are you sure\\? \\(optional\\)'])
    expect(escaped.out).toContain('keypath: login.ask')
  })

  it('asks for something to match rather than dumping the corpus', async () => {
    baseProject()
    const { err, code } = await run(['search'])
    expect(code).toBe(1)
    expect(err).toContain('nothing to search for')
  })

  it('prints every match, since a search that stops at ten reads as a corpus that holds ten', async () => {
    baseProject()
    writeProjectFile(
      'locales/en.json',
      JSON.stringify({ k: Object.fromEntries([...Array(25)].map((_, i) => [`k${i}`, `value ${i}`])) }),
    )
    writeProjectFile(
      'locales/de.json',
      JSON.stringify({ k: Object.fromEntries([...Array(25)].map((_, i) => [`k${i}`, `Wert ${i}`])) }),
    )

    const all = await run(['search', 'value', '--locale', 'en'])
    expect(all.out.match(/^keypath:/gm)).toHaveLength(25)
    expect(all.out).not.toContain('more (')

    // A cap is still available, and still says what it dropped.
    const capped = await run(['search', 'value', '--locale', 'en', '--limit', '3'])
    expect(capped.out.match(/^keypath:/gm)).toHaveLength(3)
    expect(capped.out).toContain('... 22 more (25 total), raise --limit')
  })

  it('answers in JSON for a caller joining the matches against something else', async () => {
    baseProject()
    const { out, code } = await run(['search', 'Sign in', '--json'])
    expect(code).toBe(0)

    const answer = JSON.parse(out)
    expect(answer.locales).toEqual(['en', 'de'])
    expect(answer.results).toHaveLength(1)
    expect(answer.results[0]).toMatchObject({ text: 'Sign in', key: null, total: 1 })
    expect(answer.results[0].matches[0]).toEqual({
      ns: null,
      keypath: 'login.title',
      values: { en: 'Sign in', de: 'Anmelden' },
    })
  })

  it('takes a key list on stdin, for a caller holding keys grepped out of the source', async () => {
    baseProject()
    const { out } = await run(['search', '--key', '-', '--json'], 'login.title\nlogin.ok\n')

    const [result] = JSON.parse(out).results
    expect(result.total).toBe(2)
    expect(result.matches.map((match: { keypath: string }) => match.keypath)).toEqual(['login.ok', 'login.title'])
  })

  it('refuses an empty key list rather than searching for nothing', async () => {
    baseProject()
    const { err, code } = await run(['search', '--key', '-'], '\n  \n')
    expect(code).toBe(1)
    expect(err).toContain('got nothing on stdin')
  })

  it('reads --key against bare keypaths, with --ns the only way to name a namespace', async () => {
    namespacedProject()
    const narrowed = await run(['search', '--key', 'login.title', '--ns', 'admin'])
    expect(narrowed.out).toContain('admin:login.title')
    expect(narrowed.out).not.toContain('auth:login.title')

    const spelled = await run(['search', '--key', 'admin:login.title'])
    expect(spelled.code).toBe(1)
    expect(spelled.err).toContain('spells a namespace into the key')
  })

  it('gives each term of a multi-term search its own block, in the order given', async () => {
    baseProject()
    const { out } = await run(['search', 'Anmelden', 'nothinghere', 'Weiter'])

    expect(out).toContain('1 match for "Anmelden"')
    expect(out).toContain('No matches for "nothinghere"')
    expect(out).toContain('1 match for "Weiter"')
    expect(out.indexOf('"Anmelden"')).toBeLessThan(out.indexOf('"Weiter"'))
  })

  it('prints a styleguide example this very tool reads back, so it cannot drift from the schema', async () => {
    baseProject()
    const example = await run(['styleguide-example'])
    expect(example.code).toBe(0)

    writeProjectFile('loccy.yaml', `${CONFIG}${example.out}`)
    const rendered = await run(['styleguide'])
    expect(rendered.code).toBe(0)
    expect(rendered.out).toContain('Whisker Café')

    // Every field, down the nesting and past the locales this project happens to have: a per-locale
    // glossary override is what a rendering scoped to a write drops.
    expect(rendered.out).toContain('preferred: Reservation')
    expect(rendered.out).toContain('- Buchung')
    expect(rendered.out).toContain('extends: de')
  })

  it('shows a locale the corpus never translated as a gap, not as an absent key', async () => {
    baseProject()
    writeProjectFile('locales/de.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { out } = await run(['search', 'Sign in'])
    expect(out).toContain('en: Sign in')
    expect(out).toContain('de: (missing)')
  })

  it('leaves a partial-override locale out rather than calling its inheritance a gap', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules:
    de-AT:
      extends: de
      style: |
        Jänner, not Januar.
`)
    writeProjectFile('locales/de-AT.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { out } = await run(['search', 'Sign in'])
    expect(out).toContain('de: Anmelden')
    expect(out).not.toContain('de-AT')

    // Text of its own is the case worth seeing, so that one still prints.
    const own = await run(['search', 'Weiter'])
    expect(own.out).toContain('de-AT: Weiter')
  })
})

describe('upsert-message', () => {
  it('writes every locale in one call when no styleguide constrains the copy', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')
    expect(code).toBe(0)
    expect(out).toContain('wrote 1 key')
    expect(en().login.sub).toBe('Welcome')
    expect(de().login.sub).toBe('Willkommen')
  })

  it('points at the rules and writes nothing until the values are confirmed against them', async () => {
    baseProject(STYLEGUIDED)
    const values = '{"login.sub":{"en":"Welcome","de":"Willkommen"}}'

    const first = await run(['upsert-message'], values)
    expect(first.out).toContain('[nothing written yet]')
    expect(first.out).toContain('loccy-tool styleguide')
    // The rules live in that command, so a refusal never reprints them.
    expect(first.out).not.toContain('Keep every label under 25 characters')
    expect(en().login.sub).toBeUndefined()

    const second = await run(['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)], values)
    expect(second.out).toContain('wrote 1 key')
    expect(en().login.sub).toBe('Welcome')
    expect(de().login.sub).toBe('Willkommen')
  })

  it('refuses a token issued against a styleguide that has since changed', async () => {
    baseProject(STYLEGUIDED)
    const values = '{"login.sub":{"en":"Welcome","de":"Willkommen"}}'
    const stale = tokenFrom((await run(['styleguide'])).out)

    writeProjectFile('loccy.yaml', `${STYLEGUIDED}    - term: Mittens\n`)

    const after = await run(['upsert-message', '--styleguided', stale], values)
    expect(after.out).toContain(`token ${stale} does not match this project's styleguide`)
    expect(en().login.sub).toBeUndefined()

    // The rules as they now stand carry the token that does work.
    const retry = await run(['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)], values)
    expect(retry.out).toContain('wrote 1 key')
  })

  it('refuses a token that was never issued, rather than taking the word for it', async () => {
    baseProject(STYLEGUIDED)
    const { out } = await run(['upsert-message', '--styleguided', 'deadbeef'], '{"login.sub":{"en":"W","de":"W"}}')
    expect(out).toContain('[nothing written yet]')
    expect(en().login.sub).toBeUndefined()
  })

  it('refuses a write that leaves a primary locale untranslated', async () => {
    baseProject()
    const { err, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome"}}')
    expect(code).toBe(1)
    expect(err).toContain('says nothing about primary locale(s): de')
    expect(en().login.sub).toBeUndefined()
  })

  it('refuses a locale the project does not have, rather than forking the corpus on a typo', async () => {
    baseProject()
    const { err, code, crashed } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen","fr":"Bienvenue"}}',
    )
    expect({ code, crashed }).toEqual({ code: 1, crashed: false })
    expect(err).toContain('locale "fr" is not one of this project')
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  it('refuses to bury an existing group of messages under a single message', async () => {
    baseProject()
    const { err } = await run(['upsert-message'], '{"login":{"en":"Welcome","de":"Willkommen"}}')
    expect(err).toContain('is a group of 2 message(s)')
    expect(en().login.title).toBe('Sign in')
  })

  // A term is matched as a plain substring, so an ordinary word of one language can look like one.
  it('warns about a dropped do-not-translate term but lets the write through', async () => {
    baseProject(STYLEGUIDED)
    const batch = '{"login.sub":{"en":"Loccy signs you in","de":"Wir melden dich an"}}'

    const warned = await run(['upsert-message'], batch)
    expect(warned.out).toContain('"Loccy" must stay verbatim')
    expect(en().login.sub).toBeUndefined()

    const written = await run(['upsert-message', '--styleguided', tokenFrom((await run(['styleguide'])).out)], batch)
    expect(written.code).toBe(0)
    expect(en().login.sub).toBe('Loccy signs you in')
  })

  it('writes a whole batch in one call', async () => {
    baseProject()
    const { out } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen"},"login.hint":{"en":"Try again","de":"Nochmal"}}',
    )
    expect(out).toContain('wrote 2 keys')
    expect(en().login).toMatchObject({ sub: 'Welcome', hint: 'Try again' })
    expect(de().login).toMatchObject({ sub: 'Willkommen', hint: 'Nochmal' })
  })

  it('writes none of a batch when one key fails a guard', async () => {
    baseProject()
    const { err, code } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen"},"login.hint":{"en":"Try again"}}',
    )
    expect(code).toBe(1)
    expect(err).toContain('login.hint says nothing about primary locale(s): de')
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  // Root ignores the read-only bit, so there would be nothing to roll back to observe.
  it.skipIf(process.getuid?.() === 0)('rolls the whole write back when one locale file cannot be written', async () => {
    baseProject()
    chmodSync(projectPath('locales/de.json'), 0o444)

    const { err, code } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')

    expect(code).toBe(1)
    expect(err).toContain('rolled back')
    expect(en().login.sub).toBeUndefined()
    expect(de().login.sub).toBeUndefined()
  })

  // Placeholders and shared terms read the same in every language, so two locales matching is only
  // ever a copy where one of them is configured to inherit from the other.
  it('takes matching text across separate languages as nothing to report', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'], '{"login.n":{"en":"{n} files","de":"{n} files"}}')
    expect(code).toBe(0)
    expect(out).toContain('wrote 1 key')
    expect(out).not.toContain('warning')
  })

  it('refuses a partial-override locale that repeats the locale it extends', async () => {
    baseProject(`${CONFIG}
styleguide:
  localeRules:
    de-AT:
      extends: de
`)
    writeProjectFile('locales/de-AT.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { err, code } = await run(
      ['upsert-message'],
      '{"login.sub":{"en":"Welcome","de":"Willkommen","de-AT":"Willkommen"}}',
    )
    expect(code).toBe(1)
    expect(err).toContain('de-AT is a partial override of de and repeats it')
    expect(en().login.sub).toBeUndefined()
  })

  it('answers an empty call with the locale skeleton a key needs', async () => {
    baseProject()
    const { out, code } = await run(['upsert-message'])
    expect(code).toBe(0)
    expect(out).toContain('{"login.title":{"en":"","de":""}}')
  })
})

describe('remove-message', () => {
  it('removes a key the source still calls, since nothing here reads the source', async () => {
    baseProject()
    const { code } = await run(['remove-message', 'login.title'])
    expect(code).toBe(0)
    expect(en().login.title).toBeUndefined()
  })

  it('removes several keys in one call, pruning the branch they leave empty', async () => {
    baseProject()
    const { code } = await run(['remove-message', 'login.title', 'login.ok'])
    expect(code).toBe(0)
    expect(en()).toEqual({})
    expect(de()).toEqual({})
  })

  it('refuses the whole call when one key does not exist', async () => {
    baseProject()
    const { err, code } = await run(['remove-message', 'login.ok', 'login.ghost'])
    expect(code).toBe(1)
    expect(err).toContain('not found: login.ghost')
    expect(en().login.ok).toBe('Continue')
  })
})

describe('rename-key', () => {
  it('renames across locale files, leaving the call site to the caller', async () => {
    baseProject()
    const { out, code } = await run(['rename-key'], '{"login.title":"login.heading"}')
    expect(code).toBe(0)
    expect(out).toContain('renamed: login.title -> login.heading')
    expect(en().login.heading).toBe('Sign in')
    expect(de().login.heading).toBe('Anmelden')

    expect(source()).toBe("t('login.title')\n")
  })

  it('renames a batch from stdin', async () => {
    baseProject()
    const { code } = await run(['rename-key'], '{"login.title":"login.heading","login.ok":"login.confirm"}')
    expect(code).toBe(0)
    expect(en().login).toEqual({ heading: 'Sign in', confirm: 'Continue' })
    expect(de().login).toEqual({ heading: 'Anmelden', confirm: 'Weiter' })
  })

  it('refuses a key that does not exist, before touching anything', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.title":"login.heading","login.ghost":"login.gone"}')
    expect(code).toBe(1)
    expect(err).toContain('"login.ghost" not found')
    expect(en().login.title).toBe('Sign in')
  })

  it('refuses to rename onto a key that already exists, rather than dropping one of the two', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.ok":"login.title"}')
    expect(code).toBe(1)
    expect(err).toContain('login.title already exists')
    expect(en().login).toEqual({ title: 'Sign in', ok: 'Continue' })
  })

  it('refuses a batch that renames two keys onto the same target', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.title":"login.x","login.ok":"login.x"}')
    expect(code).toBe(1)
    expect(err).toContain('renames more than one key onto: login.x')
    expect(en().login).toEqual({ title: 'Sign in', ok: 'Continue' })
  })

  it('renames only the key it was given, not one that merely starts the same way', async () => {
    baseProject()
    await run(['upsert-message'], '{"login.titlebar":{"en":"Bar","de":"Leiste"}}')

    const { code } = await run(['rename-key'], '{"login.title":"login.heading"}')
    expect(code).toBe(0)
    expect(en().login).toEqual({ heading: 'Sign in', ok: 'Continue', titlebar: 'Bar' })
  })

  it('asks for the batch rather than guessing at an empty call', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'])
    expect(code).toBe(1)
    expect(err).toContain('nothing to rename')
  })

  it('follows every key of a batch through the linked references pointing at it', async () => {
    linkedProject()
    const { out, code } = await run(['rename-key'], '{"title":"title2","ok":"ok2"}')

    expect(code).toBe(0)
    expect(out).toContain('renamed: ok -> ok2')
    expect(en()).toEqual({ title2: 'Sign in', ok2: 'Continue', hint: 'see @:title2 and @:ok2' })
  })

  it('lets a key deepen into a group, since the rename is what frees the keypath', async () => {
    baseProject()
    const { code } = await run(['rename-key'], '{"login.ok":"login.ok.label"}')

    expect(code).toBe(0)
    expect(en().login.ok).toEqual({ label: 'Continue' })
  })

  it('still refuses a rename onto a keypath the batch does not free', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.ok":"login.title.long"}')

    expect(code).toBe(1)
    expect(err).toContain('"login.title" is already a message')
  })
})

describe('modules', () => {
  const TWO_MODULES = `modules:
  app:
    framework: custom
    translations:
      glob: 'locales/**/*.json'
    usages:
      include:
        - 'src/**/*.ts'
  emails:
    framework: custom
    translations:
      glob: 'mail/**/*.json'
    usages:
      include:
        - 'src/**/*.ts'
`

  it('takes the only module unasked, since there is nothing to choose', async () => {
    baseProject()
    const { out, code } = await run(['search', 'Sign in'])
    expect({ code, matched: out.includes('keypath: login.title') }).toEqual({ code: 0, matched: true })
  })

  it('refuses to guess between modules rather than writing into the wrong corpus', async () => {
    baseProject(TWO_MODULES)
    const { err, code } = await run(['search', 'Sign in'])
    expect(code).toBe(1)
    expect(err).toContain('This project has 2 i18n modules: app, emails')
    expect(err).toContain('--module app')
  })

  it('says so in the briefing, so the refusal is never the first anyone hears of it', async () => {
    baseProject(TWO_MODULES)
    const { out } = await run(['hook-session-start'], '{}')
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain('Every command needs --module')
  })

  it('leaves the flag unmentioned where the project has one module', async () => {
    baseProject()
    const { out } = await run(['hook-session-start'], '{}')
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).not.toContain('--module')
  })

  it('reads the styleguide without a module, since one governs the whole project', async () => {
    baseProject(`${TWO_MODULES}
styleguide:
  mechanics: |
    Keep every label under 25 characters.
`)
    const { out, code } = await run(['styleguide'])
    expect(code).toBe(0)
    expect(out).toContain('Keep every label under 25 characters')
  })

  it('names the module the flag asks for, and refuses one that does not exist', async () => {
    baseProject(TWO_MODULES)
    writeProjectFile('mail/en.json', JSON.stringify({ welcome: { subject: 'Hello there' } }))

    const found = await run(['search', 'Hello', '--module', 'emails'])
    expect(found.out).toContain('keypath: welcome.subject')

    const { err, code } = await run(['search', 'Hello', '--module', 'nope'])
    expect(code).toBe(1)
    expect(err).toContain('Available: app, emails')
  })
})

describe('namespaces', () => {
  it('refuses to guess a namespace, rather than writing into one nobody named', async () => {
    namespacedProject()
    const { err, code } = await run(['upsert-message'], '{"login.title":{"en":"Hi","de":"Hallo"}}')
    expect(code).toBe(1)
    expect(err).toContain('This project has 2 namespaces')
    expect(err).toContain('--ns')
  })

  it('refuses a brand-new key with no --ns, which used to report success and write nothing', async () => {
    namespacedProject()
    const { err, code } = await run(['upsert-message'], '{"banner.text":{"en":"Hello","de":"Hallo"}}')
    expect(code).toBe(1)
    expect(err).toContain('This project has 2 namespaces')
    expect(err).not.toContain('wrote:')
  })

  it('reads the namespace --ns names', async () => {
    namespacedProject()
    const { out } = await run(['search', 'Sign in', '--ns', 'admin'])
    expect(out).toContain('admin:login.title')
    expect(out).not.toContain('auth:login.title')
    expect(out).toContain('en: Admin sign in')
  })

  it('refuses a namespace spelled into the key, since --ns is the only way to name one', async () => {
    namespacedProject()
    const args = ['upsert-message', '--ns', 'auth']
    const { err, code } = await run(args, '{"auth:login.title":{"en":"Log in","de":"Einloggen"}}')
    expect(code).toBe(1)
    expect(err).toContain('spells a namespace into the key')
    expect(JSON.parse(readProjectFile('locales/en/auth.json')).login.title).toBe('Sign in')
  })

  it('writes into the namespace --ns names, leaving the other alone', async () => {
    namespacedProject()
    const { code } = await run(['upsert-message', '--ns', 'admin'], '{"login.cta":{"en":"Go","de":"Los"}}')
    expect(code).toBe(0)
    expect(JSON.parse(readProjectFile('locales/en/admin.json')).login.cta).toBe('Go')
    expect(JSON.parse(readProjectFile('locales/en/auth.json')).login.cta).toBeUndefined()
  })
})

describe('the translation-file guard', () => {
  const hookInput = (sessionId: string) =>
    JSON.stringify({
      cwd: projectPath(''),
      session_id: sessionId,
      tool_input: { file_path: projectPath('locales/en.json') },
    })

  it('denies a hand edit of a file and lets a deliberate retry through', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`

    const first = await run(['hook-pre-edit'], hookInput(session))
    expect(JSON.parse(first.out).hookSpecificOutput.permissionDecision).toBe('deny')
    expect(first.out).toContain('repeat the edit and this lock lifts')

    const second = await run(['hook-pre-edit'], hookInput(session))
    expect(second.out).toBe('')
  })

  it('denies again once the window a denial opened has closed', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`
    await run(['hook-pre-edit'], hookInput(session))

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000)
      const later = await run(['hook-pre-edit'], hookInput(session))
      expect(JSON.parse(later.out).hookSpecificOutput.permissionDecision).toBe('deny')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hands the debug twin the same message, on a session the denial cannot silence', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`

    const real = await run(['hook-pre-edit'], hookInput(session))
    // Same session, so the real hook would already be inside the window it just opened.
    const debug = await run(['hook-pre-edit-debug'], hookInput(session))
    expect(debug.out).toContain(JSON.parse(real.out).hookSpecificOutput.permissionDecisionReason)
  })

  it('takes the file as an argument, so a replay needs no payload spelled out', async () => {
    baseProject()
    const { out } = await run(['hook-pre-edit-debug', 'locales/en.json'])
    expect(out).toContain('locales/en.json holds translations')
  })

  it("falls back to the project's own translation file when the replay names none", async () => {
    baseProject()
    const { out } = await run(['hook-pre-edit-debug'])
    expect(out).toContain('holds translations')
  })

  it.each(['src/app.ts', 'locales/en.json.bak', 'other-locales/en.json'])(
    'says nothing about %s, which no translation glob claims',
    async (file) => {
      baseProject()
      const input = JSON.stringify({
        cwd: projectPath(''),
        session_id: `test-${process.pid}-${Math.random()}`,
        tool_input: { file_path: projectPath(file) },
      })
      const { out, code } = await run(['hook-pre-edit'], input)
      expect({ out, code }).toEqual({ out: '', code: 0 })
    },
  )

  it.each([
    ['not JSON at all', 'this is not json'],
    ['no tool_input', '{"session_id":"x"}'],
    ['nothing at all', ''],
  ])('allows the edit through on hook input with %s, rather than blocking every edit', async (_case, input) => {
    baseProject()
    const { out, code, crashed } = await run(['hook-pre-edit'], input)
    expect({ out, code, crashed }).toEqual({ out: '', code: 0, crashed: false })
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

  it('keeps the rules that load rather than taking every command down with the one that does not', async () => {
    baseProject(BROKEN)
    const { out, code } = await run(['styleguide'])

    expect(code).toBe(0)
    expect(out).toContain('voice: Friendly.')
  })

  it('names what it dropped and why, since a missing rule is otherwise only copy nobody checks', async () => {
    baseProject(BROKEN)
    const { out } = await run(['styleguide'])

    expect(out).toContain('glossary: 0.definition: Required')
    expect(out).toContain('code: renamed to keys')
  })

  it('says so at session start, so nothing is written against rules that never loaded', async () => {
    baseProject(BROKEN)
    const { out } = await run(['hook-session-start-debug'], '{}')
    expect(out).toContain('Styleguide fields ignored')
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
    expect(out).toContain('localeRules.de: "de" cannot extend itself')
    expect(out).toContain('de-AT')
  })
})

describe('a project with no config', () => {
  it('points at init rather than guessing the setup', async () => {
    makeProject({ 'locales/en.json': '{}' })
    const { err, code } = await run(['search', 'a'])
    expect(code).toBe(1)
    expect(err).toContain('loccy-tool init')
  })

  it('says only where the binary is at session start, so setup can run and nothing else is claimed', async () => {
    makeProject({ 'locales/en.json': '{"a":"b"}' })
    const { out, code } = await run(['hook-session-start'], '{}')

    const context = JSON.parse(out).hookSpecificOutput.additionalContext
    expect(code).toBe(0)
    expect(context).toContain('Run loccy-tool by its full path')
    expect(context).not.toContain('## This project')
  })

  it('scaffolds the config once, and never overwrites it', async () => {
    makeProject({ 'locales/en.json': '{"a":"b"}', 'src/app.ts': "t('a')\n" })
    expect((await run(['init'])).out).toContain('created loccy.yaml')

    // The scaffolded file has to be one the tool can actually read back.
    const found = await run(['search', 'b'])
    expect(found.code).toBe(0)
    expect(found.out).toContain('en: b')

    const again = await run(['init'])
    expect(again.code).toBe(1)
    expect(again.err).toContain('already exists')
  })
})
