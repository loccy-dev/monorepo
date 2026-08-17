import { afterEach, describe, expect, it } from 'vitest'
import { baseProject, cleanupProject, CONFIG, namespacedProject, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'

afterEach(cleanupProject)

/** The base project's one translated key, as every block prints it. */
const LOGIN_TITLE = `keypath: login.title
locales:
  en: Sign in  locales/en.json:1
  de: Anmelden  locales/de.json:1
`

describe('search', () => {
  it('shows a key in every locale, and the file and line each keeps it in', async () => {
    baseProject()
    const { out, code } = await run(['search', 'Sign in'])

    expect(code).toBe(0)
    expect(out).toBe(`1 match for "Sign in"\n\n${LOGIN_TITLE}`)
  })

  it('searches values and reports an honest miss', async () => {
    baseProject()

    expect((await run(['search', 'Anmelden'])).out).toBe(`1 match for "Anmelden"\n\n${LOGIN_TITLE}`)
    expect((await run(['search', 'nothinghere'])).out).toBe('No matches for "nothinghere"')
  })

  it('leaves keypaths to --key, so a word searched as text finds only messages that say it', async () => {
    baseProject()

    expect((await run(['search', 'login.title'])).out).toBe('No matches for "login.title"')
    expect((await run(['search', '--key', 'login.title'])).out).toBe(
      `1 match for keys matching "login.title"\n\n${LOGIN_TITLE}`,
    )
  })

  it('matches a group under --key, so a whole subtree is read in one call', async () => {
    baseProject()
    const { out } = await run(['search', '--key', 'login.'])

    expect(out).toBe(`2 matches for keys matching "login."

keypath: login.ok
locales:
  en: Continue  locales/en.json:1
  de: Weiter  locales/de.json:1

${LOGIN_TITLE}`)
  })

  it('narrows a text query by keypath when given both, rather than matching either', async () => {
    baseProject()
    const both = await run(['search', 'Sign in', '--key', 'login.title'])
    expect(both.out).toBe(`1 match for "Sign in" and keys matching "login.title"\n\n${LOGIN_TITLE}`)

    // The text is there and the key exists, but not on the same message.
    const disjoint = await run(['search', 'Sign in', '--key', 'login.ok'])
    expect(disjoint.out).toBe('No matches for "Sign in" and keys matching "login.ok"')
  })

  it('reads every query as a pattern, and refuses one that does not compile', async () => {
    baseProject()
    const matched = await run(['search', '^Sign', '--key', 'title$'])
    expect(matched.out).toBe(`1 match for "^Sign" and keys matching "title$"\n\n${LOGIN_TITLE}`)

    // A glob is not a pattern, and saying so beats answering with an empty result.
    const glob = await run(['search', '--key', '*title*'])
    expect(glob.code).toBe(1)
    expect(glob.err).toBe(
      'error: --key "*title*" is not a valid regular expression: ' +
        'Invalid regular expression: /*title*/i: Nothing to repeat',
    )
  })

  it('matches a phrase out of the UI once its pattern characters are escaped', async () => {
    baseProject()
    await run(['upsert-message'], '{"login.ask":{"en":"Are you sure? (optional)","de":"Sicher? (optional)"}}')

    const { out } = await run(['search', 'Are you sure\\? \\(optional\\)'])

    expect(out).toBe(`1 match for "Are you sure\\? \\(optional\\)"

keypath: login.ask
locales:
  en: Are you sure? (optional)  locales/en.json:1
  de: Sicher? (optional)  locales/de.json:1
`)
  })

  it('asks for something to match rather than dumping the corpus', async () => {
    baseProject()
    const { err, code, out } = await run(['search'])

    expect({ code, out }).toEqual({ code: 1, out: '' })
    expect(err).toBe(`error: nothing to search for
  pass text to match, or --key <pattern> to match the keypath, or both`)
  })

  // The block shape is spelled out by every other test here, so this one counts them.
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
    expect(all.out.startsWith('25 matches for "value" in en\n\n')).toBe(true)
    expect(all.out.match(/^keypath:/gm)).toHaveLength(25)
    expect(all.out).not.toContain('more (')

    const capped = await run(['search', 'value', '--locale', 'en', '--limit', '3'])
    expect(capped.out).toBe(`25 matches for "value" in en

keypath: k.k0
locales:
  en: value 0  locales/en.json:1

keypath: k.k1
locales:
  en: value 1  locales/en.json:1

keypath: k.k10
locales:
  en: value 10  locales/en.json:1

... 22 more (25 total), raise --limit`)
  })

  it('answers in JSON for a caller joining the matches against something else', async () => {
    baseProject()
    const { out, code } = await run(['search', 'Sign in', '--json'])

    expect(code).toBe(0)
    expect(out).toBe(`{
  "locales": [
    "en",
    "de"
  ],
  "results": [
    {
      "text": "Sign in",
      "key": null,
      "total": 1,
      "matches": [
        {
          "ns": null,
          "keypath": "login.title",
          "values": {
            "en": "Sign in",
            "de": "Anmelden"
          },
          "files": {
            "de": {
              "file": "locales/de.json",
              "line": 1
            },
            "en": {
              "file": "locales/en.json",
              "line": 1
            }
          }
        }
      ]
    }
  ]
}`)
  })

  // A keypath names no file, and the corpus is one file per locale, times one per namespace.
  it('says which file each locale keeps a key in, and the line it sits on', async () => {
    baseProject()
    writeProjectFile('locales/en.json', `{\n  "login": {\n    "title": "Sign in",\n    "ok": "Continue"\n  }\n}\n`)

    const { out } = await run(['search', 'Sign in'])

    expect(out).toBe(`1 match for "Sign in"

keypath: login.title
locales:
  en: Sign in  locales/en.json:3
  de: Anmelden  locales/de.json:1
`)
  })

  it('names the file of the namespace the key was found in, not the first that holds the keypath', async () => {
    namespacedProject()
    const { out } = await run(['search', 'Admin sign in'])

    expect(out).toBe(`1 match for "Admin sign in"

keypath: admin:login.title
locales:
  en: Admin sign in  locales/en/admin.json:1
  de: Admin-Anmeldung  locales/de/admin.json:1
`)
  })

  it('takes a key list on stdin, for a caller holding keys grepped out of the source', async () => {
    baseProject()
    const { out } = await run(['search', '--key', '-', '--json'], 'login.title\nlogin.ok\n')

    const [result] = JSON.parse(out).results
    expect(result).toMatchObject({ text: null, key: 'the keys on stdin', total: 2 })
    expect(result.matches.map((match: { keypath: string }) => match.keypath)).toEqual(['login.ok', 'login.title'])
  })

  it('refuses an empty key list rather than searching for nothing', async () => {
    baseProject()
    const { err, code } = await run(['search', '--key', '-'], '\n  \n')

    expect(code).toBe(1)
    expect(err).toBe(`error: --key - got nothing on stdin
  pipe the keypaths in, one per line`)
  })

  it('reads --key against bare keypaths, with --ns the only way to name a namespace', async () => {
    namespacedProject()
    const narrowed = await run(['search', '--key', 'login.title', '--ns', 'admin'])
    expect(narrowed.out).toBe(`1 match for keys matching "login.title"

keypath: admin:login.title
locales:
  en: Admin sign in  locales/en/admin.json:1
  de: Admin-Anmeldung  locales/de/admin.json:1
`)

    const spelled = await run(['search', '--key', 'admin:login.title'])
    expect(spelled.code).toBe(1)
    expect(spelled.err).toBe(`"admin:login.title" spells a namespace into the key.
  a key is always a bare keypath; the namespace goes in --ns`)
  })

  it('gives each term of a multi-term search its own block, in the order given', async () => {
    baseProject()
    const { out } = await run(['search', 'Anmelden', 'nothinghere', 'Weiter'])

    expect(out).toBe(`1 match for "Anmelden"

${LOGIN_TITLE}

No matches for "nothinghere"

1 match for "Weiter"

keypath: login.ok
locales:
  en: Continue  locales/en.json:1
  de: Weiter  locales/de.json:1
`)
  })

  it('shows a locale the corpus never translated as a gap, not as an absent key', async () => {
    baseProject()
    writeProjectFile('locales/de.json', JSON.stringify({ login: { ok: 'Weiter' } }))

    const { out } = await run(['search', 'Sign in'])

    expect(out).toBe(`1 match for "Sign in"

keypath: login.title
locales:
  en: Sign in  locales/en.json:1
  de: (missing)
`)
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

    // de-AT carries no title of its own, which is the norm rather than a gap.
    expect((await run(['search', 'Sign in'])).out).toBe(`1 match for "Sign in"\n\n${LOGIN_TITLE}`)

    // Where it does deviate, it is listed like any other locale.
    expect((await run(['search', 'Weiter'])).out).toBe(`1 match for "Weiter"

keypath: login.ok
locales:
  en: Continue  locales/en.json:1
  de: Weiter  locales/de.json:1
  de-AT: Weiter  locales/de-AT.json:1
`)
  })
})
