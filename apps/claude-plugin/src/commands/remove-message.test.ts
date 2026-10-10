import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, de, en, makeProject, readProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

describe('remove-message', () => {
  it('removes a key the source still calls, since nothing here reads the source', async () => {
    baseProject()
    const { out, code } = await run(['remove-message', 'login.title'])
    expect(code).toBe(0)
    expect(out).toBe(`removed: login.title
files: locales/{de.json, en.json}`)
    expect(en().login.title).toBeUndefined()
  })

  it('removes several keys in one call, pruning the branch they leave empty', async () => {
    baseProject()
    const { out, code } = await run(['remove-message', 'login.title', 'login.ok'])
    expect(code).toBe(0)
    expect(out).toBe(`removed: login.title, login.ok
files: locales/{de.json, en.json}`)
    expect(en()).toEqual({})
    expect(de()).toEqual({})
  })

  it('drops the whole line from .properties bundles, not just the value', async () => {
    makeProject({
      'loccy.yaml': `modules:
  default:
    framework: custom
    translations:
      glob: 'i18n/*.properties'
      layout: 'messages_{locale}.properties'
    usages:
      include:
        - 'src/**/*.ts'
`,
      'i18n/messages_en.properties': 'login.title=Sign in\nlogin.ok=Continue\n',
      'i18n/messages_de.properties': 'login.title=Anmelden\nlogin.ok=Weiter\n',
    })
    const { out, err, code } = await run(['remove-message', 'login.title'])
    expect({ code, err }).toEqual({ code: 0, err: '' })
    expect(out).toBe(`removed: login.title
files: i18n/{messages_de.properties, messages_en.properties}`)
    expect(readProjectFile('i18n/messages_en.properties')).toBe('login.ok=Continue\n')
    expect(readProjectFile('i18n/messages_de.properties')).toBe('login.ok=Weiter\n')
  })

  it('refuses the whole call when one key does not exist', async () => {
    baseProject()
    const { err, code, out } = await run(['remove-message', 'login.ok', 'login.ghost'])
    expect({ code, out }).toEqual({ code: 1, out: '' })
    expect(err).toBe('error: not found: login.ghost')
    expect(en().login.ok).toBe('Continue')
  })
})
