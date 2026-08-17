import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'pathe'

let root = ''
let previousCwd = ''

/** A throwaway project, with the process pointed at it the way a real invocation would be. */
export function makeProject(files: Record<string, string>): string {
  previousCwd = process.cwd()
  root = mkdtempSync(join(tmpdir(), 'loccy-tool-test-'))
  for (const [path, content] of Object.entries(files)) writeProjectFile(path, content)
  process.chdir(root)
  return root
}

export function cleanupProject(): void {
  if (previousCwd) process.chdir(previousCwd)
  if (root) rmSync(root, { recursive: true, force: true })
  root = ''
  previousCwd = ''
}

/** Stand somewhere below the project root, which in a monorepo is where a session actually opens. */
export function chdirInto(path: string): string {
  const full = join(root, path)
  mkdirSync(full, { recursive: true })
  process.chdir(full)
  return full
}

export function writeProjectFile(path: string, content: string): void {
  const full = join(root, path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

export function readProjectFile(path: string): string {
  return readFileSync(join(root, path), 'utf-8')
}

export function projectPath(path: string): string {
  return join(root, path)
}

export const CONFIG = `modules:
  default:
    framework: custom
    translations:
      glob: 'locales/**/*.json'
    usages:
      include:
        - 'src/**/*.ts'
`

/** The project every test starts from: two locales, one key used from source and one unused. */
export function baseProject(config = CONFIG): string {
  return makeProject({
    'loccy.yaml': config,
    'locales/en.json': JSON.stringify({ login: { title: 'Sign in', ok: 'Continue' } }),
    'locales/de.json': JSON.stringify({ login: { title: 'Anmelden', ok: 'Weiter' } }),
    'src/app.ts': `t('login.title')\n`,
  })
}

const NAMESPACED_CONFIG = `modules:
  default:
    framework: custom
    translations:
      glob: 'locales/**/*.json'
      layout: '{locale}/{namespace}.json'
    usages:
      include:
        - 'src/**/*.ts'
`

const LINKED_CONFIG = `modules:
  default:
    framework: vue-i18n
    translations:
      glob: 'locales/**/*.json'
    usages:
      include:
        - 'src/**/*.ts'
`

/** A framework with linked messages (`@:key`), which a rename has to follow too. */
export function linkedProject(): string {
  return makeProject({
    'loccy.yaml': LINKED_CONFIG,
    'locales/en.json': JSON.stringify({ title: 'Sign in', ok: 'Continue', hint: 'see @:title and @:ok' }),
    'src/app.ts': `t('title')\nt('ok')\n`,
  })
}

/** Two namespaces holding the same keypath, which is the only case that needs `--ns`. */
export function namespacedProject(): string {
  return makeProject({
    'loccy.yaml': NAMESPACED_CONFIG,
    'locales/en/auth.json': JSON.stringify({ login: { title: 'Sign in' } }),
    'locales/de/auth.json': JSON.stringify({ login: { title: 'Anmelden' } }),
    'locales/en/admin.json': JSON.stringify({ login: { title: 'Admin sign in' } }),
    'locales/de/admin.json': JSON.stringify({ login: { title: 'Admin-Anmeldung' } }),
    'src/app.ts': `t('auth:login.title')\n`,
  })
}

/** What the base project's files say now, which is what a write has to be checked against. */
export const en = () => JSON.parse(readProjectFile('locales/en.json'))
export const de = () => JSON.parse(readProjectFile('locales/de.json'))
export const source = () => readProjectFile('src/app.ts')
