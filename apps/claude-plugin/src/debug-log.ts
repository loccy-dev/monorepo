import { appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'pathe'

/**
 * One file per machine, replaced at session start, so a session's trace reads top to bottom. Never
 * named in anything a session sees: the trace records what an agent does unprompted, which knowing
 * about it would change.
 */
const DEBUG_LOG = join(tmpdir(), 'loccy-claude-plugin.log')

const MAX_CAPTURE = 4000

function debugEnabled(): boolean {
  const flag = process.env.LOCCY_DEBUG
  return flag === '1' || flag === 'true'
}

function append(text: string): void {
  try {
    appendFileSync(DEBUG_LOG, text)
  } catch {
    // the trace is never worth failing a command over
  }
}

function clip(text: string): string {
  return text.length > MAX_CAPTURE
    ? `${text.slice(0, MAX_CAPTURE)}\n[... ${text.length - MAX_CAPTURE} more chars]`
    : text
}

function stamp(): string {
  return new Date().toISOString()
}

/** Start the session's log over, so the trace covers this session and nothing before it. */
export function startLog(): void {
  if (!debugEnabled()) return
  try {
    writeFileSync(DEBUG_LOG, `=== loccy-tool trace, session started ${stamp()} ===\n`)
  } catch {
    // as above
  }
}

let stdinSeen: string | null = null

/** What a command read from stdin, recorded where it is read rather than guessed at afterwards. */
export function recordStdin(raw: string): void {
  if (debugEnabled() && raw.trim()) stdinSeen = raw
}

/**
 * Record this invocation: its arguments, what it read, what it printed and how it exited. Output is
 * teed rather than intercepted, so the trace can never change what the caller sees.
 */
export function traceInvocation(argv: string[]): void {
  if (!debugEnabled()) return

  const started = Date.now()
  const out: string[] = []
  const err: string[] = []

  const tee = (target: string[], original: (...args: unknown[]) => void) => {
    return (...args: unknown[]): void => {
      target.push(args.map(String).join(' '))
      original(...args)
    }
  }
  console.log = tee(out, console.log.bind(console))
  console.error = tee(err, console.error.bind(console))

  process.on('exit', (code) => {
    const lines = [
      `\n[${stamp()}] loccy-tool ${argv.slice(2).join(' ')}`,
      `  cwd: ${process.cwd()}`,
      `  exit: ${code} (${Date.now() - started}ms)`,
    ]
    if (stdinSeen !== null) lines.push(`  stdin:\n${indent(clip(stdinSeen))}`)
    if (out.length) lines.push(`  stdout:\n${indent(clip(out.join('\n')))}`)
    if (err.length) lines.push(`  stderr:\n${indent(clip(err.join('\n')))}`)
    append(`${lines.join('\n')}\n`)
  })
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n')
}
