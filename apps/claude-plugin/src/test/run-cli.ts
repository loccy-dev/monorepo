import { Readable } from 'node:stream'
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

/**
 * Stand in for the pipe, so `readStdin` is exercised rather than replaced. Returns the undo: the
 * real stdin is the terminal's, and a test that never went through here would otherwise inherit a
 * spent stream.
 */
function pipeStdin(value: string): () => void {
  const real = Object.getOwnPropertyDescriptor(process, 'stdin')!
  const stream = Readable.from(value ? [value] : [])
  Object.defineProperty(stream, 'isTTY', { value: false })
  Object.defineProperty(process, 'stdin', { value: stream, configurable: true })
  return () => Object.defineProperty(process, 'stdin', real)
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

  const restoreStdin = pipeStdin(stdin)

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
    restoreStdin()
  }

  return { out: out.join('\n'), err: err.join('\n'), code, crashed }
}
