import { afterEach, describe, expect, it } from 'vitest'
import { cleanupProject, makeProject } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

describe('a project with no config', () => {
  it.each([['search', 'a'], ['styleguide'], ['upsert-message']])(
    'points %s at init rather than guessing the setup',
    async (...argv) => {
      makeProject({ 'locales/en.json': '{}' })
      const { err, code, out } = await run(argv)
      expect({ code, out }).toEqual({ code: 1, out: '' })
      expect(err).toBe(`No loccy.yaml, so there is nothing to read this project's i18n setup from.
Scaffold it first: loccy-tool init`)
    },
  )

  it('scaffolds the config once, and never overwrites it', async () => {
    makeProject({ 'locales/en.json': '{"a":"b"}', 'src/app.ts': "t('a')\n" })
    expect((await run(['init'])).out).toBe(`created loccy.yaml

It was written from auto-detection, which guesses. Check every field against the real repo:
framework, source globs, translation glob, layout, locales. Then author the styleguide.`)

    // The scaffolded file has to be one the tool can actually read back.
    const found = await run(['search', 'b'])
    expect(found.code).toBe(0)
    expect(found.out).toBe(`1 match for "b"

keypath: a
locales:
  en: b  locales/en.json:1
`)

    const again = await run(['init'])
    expect(again.code).toBe(1)
    expect(again.err).toBe(`loccy.yaml already exists. Edit it directly, against the field reference at
https://loccy.dev/schemas/config.schema.json. The session briefing shows what the file resolves to.`)
  })
})
