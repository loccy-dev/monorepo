import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, namespacedProject, readProjectFile, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

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
    expect(code).toBe(0)
    expect(out).toBe(`1 match for "Sign in"

keypath: login.title
locales:
  en: Sign in  locales/en.json:1
  de: Anmelden  locales/de.json:1
`)
  })

  it('refuses to guess between modules rather than writing into the wrong corpus', async () => {
    baseProject(TWO_MODULES)
    const { err, code } = await run(['search', 'Sign in'])
    expect(code).toBe(1)
    expect(err).toBe(`This project has 2 i18n modules: app, emails
  name the one you mean with --module, e.g. --module app`)
  })

  it('says so in the briefing, so the refusal is never the first anyone hears of it', async () => {
    baseProject(TWO_MODULES)
    const { out } = await run(['hook-session-start'], '{}')
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain(`app: locales: en, de
app: translation files: locales/{de.json, en.json}
app: namespaces: none
emails: namespaces: none

Every command needs --module, since this project has more than one.`)
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
    expect(out.replace(/--styleguided [0-9a-f]{8}/, '--styleguided <token>'))
      .toBe(`# Styleguide, as authored in loccy.yaml

styleguide:
  mechanics: |
    Keep every label under 25 characters.

## Writing against these rules

  loccy-tool upsert-message --styleguided <token> <<'EOF'
  {"<keypath>": {"<locale>": "<text>"}}
  EOF

The token above says these rules were read. It is derived from them, not issued per write, so the
same token confirms every write until the rules change. Once you read the full styleguide, pass it always.`)
  })

  it('names the module the flag asks for, and refuses one that does not exist', async () => {
    baseProject(TWO_MODULES)
    writeProjectFile('mail/en.json', JSON.stringify({ welcome: { subject: 'Hello there' } }))

    const found = await run(['search', 'Hello', '--module', 'emails'])
    expect(found.out).toBe(`1 match for "Hello"

keypath: welcome.subject
locales:
  en: Hello there  mail/en.json:1
`)

    const { err, code } = await run(['search', 'Hello', '--module', 'nope'])
    expect(code).toBe(1)
    expect(err).toBe('Module "nope" not found. Available: app, emails')
  })
})

describe('namespaces', () => {
  it('refuses to guess a namespace, rather than writing into one nobody named', async () => {
    namespacedProject()
    const { err, code } = await run(['upsert-message'], '{"login.title":{"en":"Hi","de":"Hallo"}}')
    expect(code).toBe(1)
    expect(err).toBe(`This project has 2 namespaces: admin, auth
  name the one you mean with --ns, e.g. --ns admin`)
  })

  it('refuses a brand-new key with no --ns, which used to report success and write nothing', async () => {
    namespacedProject()
    const { err, code, out } = await run(['upsert-message'], '{"banner.text":{"en":"Hello","de":"Hallo"}}')
    expect({ code, out }).toEqual({ code: 1, out: '' })
    expect(err).toBe(`This project has 2 namespaces: admin, auth
  name the one you mean with --ns, e.g. --ns admin`)
  })

  it('reads the namespace --ns names', async () => {
    namespacedProject()
    const { out } = await run(['search', 'Sign in', '--ns', 'admin'])
    expect(out).toBe(`1 match for "Sign in"

keypath: admin:login.title
locales:
  en: Admin sign in  locales/en/admin.json:1
  de: Admin-Anmeldung  locales/de/admin.json:1
`)
  })

  it('refuses a namespace spelled into the key, since --ns is the only way to name one', async () => {
    namespacedProject()
    const args = ['upsert-message', '--ns', 'auth']
    const { err, code } = await run(args, '{"auth:login.title":{"en":"Log in","de":"Einloggen"}}')
    expect(code).toBe(1)
    expect(err).toBe(`"auth:login.title" spells a namespace into the key.
  a key is always a bare keypath; the namespace goes in --ns`)
    expect(JSON.parse(readProjectFile('locales/en/auth.json')).login.title).toBe('Sign in')
  })

  it('writes into the namespace --ns names, leaving the other alone', async () => {
    namespacedProject()
    const { out, code } = await run(['upsert-message', '--ns', 'admin'], '{"login.cta":{"en":"Go","de":"Los"}}')
    expect(code).toBe(0)
    expect(out).toBe('wrote 1 key to locales/{en/admin.json, de/admin.json}')
    expect(JSON.parse(readProjectFile('locales/en/admin.json')).login.cta).toBe('Go')
    expect(JSON.parse(readProjectFile('locales/en/auth.json')).login.cta).toBeUndefined()
  })
})
