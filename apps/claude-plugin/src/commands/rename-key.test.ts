import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, de, en, linkedProject, source } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

describe('rename-key', () => {
  it('renames across locale files, leaving the call site to the caller', async () => {
    baseProject()
    const { out, code } = await run(['rename-key'], '{"login.title":"login.heading"}')
    expect(code).toBe(0)
    expect(out).toBe(`renamed: login.title -> login.heading
files: locales/{de.json, en.json}`)
    expect(en().login.heading).toBe('Sign in')
    expect(de().login.heading).toBe('Anmelden')

    expect(source()).toBe("t('login.title')\n")
  })

  it('renames a batch from stdin', async () => {
    baseProject()
    const { out, code } = await run(['rename-key'], '{"login.title":"login.heading","login.ok":"login.confirm"}')
    expect(code).toBe(0)
    expect(out).toBe(`renamed: login.title -> login.heading
renamed: login.ok -> login.confirm
files: locales/{de.json, en.json}`)
    expect(en().login).toEqual({ heading: 'Sign in', confirm: 'Continue' })
    expect(de().login).toEqual({ heading: 'Anmelden', confirm: 'Weiter' })
  })

  it('refuses a key that does not exist, before touching anything', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.title":"login.heading","login.ghost":"login.gone"}')
    expect(code).toBe(1)
    expect(err).toBe('error: "login.ghost" not found in namespace "_"')
    expect(en().login.title).toBe('Sign in')
  })

  it('refuses to rename onto a key that already exists, rather than dropping one of the two', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.ok":"login.title"}')
    expect(code).toBe(1)
    expect(err).toBe(`error: login.title already exists, so renaming login.ok onto it would drop one of the two
  pick a free key, or merge them deliberately: upsert-message login.title, then remove-message login.ok`)
    expect(en().login).toEqual({ title: 'Sign in', ok: 'Continue' })
  })

  it('refuses a batch that renames two keys onto the same target', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.title":"login.x","login.ok":"login.x"}')
    expect(code).toBe(1)
    expect(err).toBe('error: this batch renames more than one key onto: login.x')
    expect(en().login).toEqual({ title: 'Sign in', ok: 'Continue' })
  })

  it('renames only the key it was given, not one that merely starts the same way', async () => {
    baseProject()
    await run(['upsert-message'], '{"login.titlebar":{"en":"Bar","de":"Leiste"}}')

    const { out, code } = await run(['rename-key'], '{"login.title":"login.heading"}')
    expect(code).toBe(0)
    expect(out).toBe(`renamed: login.title -> login.heading
files: locales/{de.json, en.json}`)
    expect(en().login).toEqual({ heading: 'Sign in', ok: 'Continue', titlebar: 'Bar' })
  })

  it('asks for the batch rather than guessing at an empty call', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'])
    expect(code).toBe(1)
    expect(err).toBe(`error: nothing to rename
  loccy-tool rename-key <<'EOF'
  {"login.title":"login.heading","login.ok":"login.confirm"}
  EOF`)
  })

  it('follows every key of a batch through the linked references pointing at it', async () => {
    linkedProject()
    const { out, code } = await run(['rename-key'], '{"title":"title2","ok":"ok2"}')

    expect(code).toBe(0)
    expect(out).toBe(`renamed: title -> title2
renamed: ok -> ok2
files: locales/en.json
linked references rewritten in: locales/en.json`)
    expect(en()).toEqual({ title2: 'Sign in', ok2: 'Continue', hint: 'see @:title2 and @:ok2' })
  })

  it('lets a key deepen into a group, since the rename is what frees the keypath', async () => {
    baseProject()
    const { out, code } = await run(['rename-key'], '{"login.ok":"login.ok.label"}')

    expect(code).toBe(0)
    expect(out).toBe(`renamed: login.ok -> login.ok.label
files: locales/{de.json, en.json}`)
    expect(en().login.ok).toEqual({ label: 'Continue' })
  })

  it('still refuses a rename onto a keypath the batch does not free', async () => {
    baseProject()
    const { err, code } = await run(['rename-key'], '{"login.ok":"login.title.long"}')

    expect(code).toBe(1)
    expect(err).toBe(`error: "login.title" is already a message, so nothing can nest under it
  rename it out of the way first, or pick a keypath that is not below it`)
  })
})
