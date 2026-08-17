import { mkdirSync, writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'pathe'
import { baseProject, chdirInto, cleanupProject, makeProject, projectPath, writeProjectFile } from './test/project'
import { run } from './test/run-cli'
import { findProjectRoot } from './project-root'

afterEach(cleanupProject)

describe('findProjectRoot', () => {
  it('takes the directory it stands in when the config is right there', () => {
    const root = baseProject()
    expect(findProjectRoot(root)).toBe(root)
  })

  it('climbs to the config, a session in a monorepo opening in a package rather than the root', () => {
    const root = baseProject()
    expect(findProjectRoot(chdirInto('packages/ui/src'))).toBe(root)
  })

  it('takes the nearest config, the one further up governing what it does not cover', () => {
    baseProject()
    const nested = projectPath('packages/ui')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, 'loccy.yaml'), 'modules: {}\n')

    expect(findProjectRoot(join(nested, 'src'))).toBe(nested)
  })

  // A config one directory further up somebody's projects folder is not this project's.
  it('stops at the repository, whatever stands above it', () => {
    const root = baseProject()
    mkdirSync(projectPath('inner/.git'), { recursive: true })
    const inner = projectPath('inner')

    expect(findProjectRoot(inner)).toBe(inner)
    expect(findProjectRoot(root)).toBe(root)
  })
})

describe('a session opening below the project root', () => {
  it('is briefed on the setup, rather than told the project has no i18n at all', async () => {
    baseProject()
    const cwd = chdirInto('packages/ui')

    const { out } = await run(['hook-session-start'], JSON.stringify({ cwd }))

    expect(out).not.toBe('')
    expect(JSON.parse(out).hookSpecificOutput.additionalContext).toContain(`## This project uses i18n

modules:
  default:
    framework: custom
    translations:
      glob: 'locales/**/*.json'
    usages:
      include:
        - 'src/**/*.ts'

locales: en, de
translation files: locales/{de.json, en.json}
namespaces: none`)
  })

  it('has its hand edits of a translation file guarded just the same', async () => {
    baseProject()
    const cwd = chdirInto('packages/ui')
    const input = JSON.stringify({
      cwd,
      session_id: `test-${process.pid}-${Math.random()}`,
      tool_input: { file_path: projectPath('locales/en.json') },
    })

    const { out } = await run(['hook-pre-edit'], input)

    expect(JSON.parse(out).hookSpecificOutput).toEqual({
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'locales/en.json holds translations, and those are written with loccy-tool upsert-message ' +
        '(see --help). If you do need to edit it by hand, repeat the edit and this lock lifts for ' +
        'the next 5 minutes.',
    })
  })

  it('reads and writes the same corpus the root would', async () => {
    baseProject()
    chdirInto('packages/ui')

    const found = await run(['search', 'Sign in'])
    expect(found.code).toBe(0)
    expect(found.out).toBe(`1 match for "Sign in"

keypath: login.title
locales:
  en: Sign in  locales/en.json:1
  de: Anmelden  locales/de.json:1
`)

    const { out } = await run(['upsert-message'], '{"login.sub":{"en":"Welcome","de":"Willkommen"}}')
    expect(out).toBe('wrote 1 key to locales/{en.json, de.json}')
  })

  it('still says there is nothing to describe where the repository has no config at all', async () => {
    makeProject({ 'locales/en.json': '{"a":"b"}', '.git/HEAD': 'ref: refs/heads/main\n' })
    writeProjectFile('packages/ui/.keep', '')
    const cwd = chdirInto('packages/ui')

    const { out } = await run(['hook-session-start'], JSON.stringify({ cwd }))
    expect(out).toBe('')
  })
})
