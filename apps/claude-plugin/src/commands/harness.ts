import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { dirname, join } from 'pathe'
import { vi } from 'vitest'
import { buildProgram } from '../program'

/** What a command left behind: what it printed, and how it ended. */
export interface Run {
  out: string
  err: string
  code: number
  /**
   * The command threw instead of reporting and exiting. A refusal and a crash both land in `err`,
   * so without this a test could not tell an actionable message from a stack trace.
   */
  crashed: boolean
}

class ExitSignal extends Error {}

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

/** Stand in for the pipe, so `readStdin` is exercised rather than replaced. */
function pipeStdin(value: string): void {
  const stream = Readable.from(value ? [value] : [])
  Object.defineProperty(stream, 'isTTY', { value: false })
  Object.defineProperty(process, 'stdin', { value: stream, configurable: true })
}

/**
 * Run the CLI the way `cli.ts` does, down to how it reports a rejected action, so a test sees the
 * output an agent would.
 */
export async function run(argv: string[], stdin = ''): Promise<Run> {
  const out: string[] = []
  const err: string[] = []
  let code = 0
  let crashed = false

  const exit = vi.spyOn(process, 'exit').mockImplementation(((status?: number) => {
    code = status ?? 0
    throw new ExitSignal()
  }) as never)
  const log = vi
    .spyOn(console, 'log')
    .mockImplementation((...args: unknown[]) => void out.push(args.map(String).join(' ')))
  const error = vi
    .spyOn(console, 'error')
    .mockImplementation((...args: unknown[]) => void err.push(args.map(String).join(' ')))
  // Commander writes its own argument errors straight to the stream, bypassing console.
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
    err.push(String(chunk).trimEnd())
    return true
  }) as never)

  pipeStdin(stdin)

  try {
    await buildProgram().parseAsync(['node', 'loccy-tool', ...argv])
  } catch (thrown) {
    if (!(thrown instanceof ExitSignal)) {
      err.push(`error: ${thrown instanceof Error ? thrown.message : String(thrown)}`)
      code = 1
      crashed = true
    }
  } finally {
    exit.mockRestore()
    log.mockRestore()
    error.mockRestore()
    stderr.mockRestore()
  }

  return { out: out.join('\n'), err: err.join('\n'), code, crashed }
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
