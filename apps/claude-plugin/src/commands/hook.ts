import { createHash, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
// pathe, not node:path — the relative path is matched against globs, which are posix-separated
// whatever the platform.
import { relative, isAbsolute, join } from 'pathe'
import picomatch from 'picomatch'
import type { LoccyConfig } from '@repo/types/config.types'
import { loccyConfigFilename } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { createNodePlatform } from '@repo/node-platform/index'
import { LoccyConfigError, readConfigFile } from '@repo/shared/core/loccy-config/loccy-config'
import { createResourceManager } from '@repo/shared/core/resources/resource-manager'
import { readStdin } from '../stdin'
import { startLog } from '../debug-log'
import { buildStartupContext } from './setup'

interface HookInput {
  cwd?: string
  session_id?: string
  tool_name?: string
  tool_input?: { file_path?: string }
}

async function readHookInput(): Promise<HookInput | null> {
  const raw = await readStdin()
  if (!raw.trim()) return null
  try {
    return JSON.parse(raw) as HookInput
  } catch {
    return null
  }
}

/**
 * The payload as the harness wants it, one line. A debug run gets the same object laid out and its
 * text broken where the text breaks: the escaped form is what a machine reads, and every field here
 * is prose written for a person. Reading it back as JSON is not the point, and it will not parse.
 */
function emit(
  payload: { hookSpecificOutput: Record<string, unknown>; suppressOutput?: boolean },
  debug: boolean,
): void {
  const json = JSON.stringify(payload, null, debug ? 2 : 0)
  // A newline the text itself carries, never a backslash the text happens to hold before an "n".
  console.log(debug ? json.replace(/(?<!\\)\\n/g, '\n') : json)
}

/**
 * A hook deciding it has nothing to say, which is most of the time. Silent for the harness; a debug
 * run gets the reason, since an empty terminal is otherwise indistinguishable from a broken hook.
 */
function silent(debug: boolean, reason: string): void {
  if (debug) console.error(`no output: ${reason}`)
}

function reasonFor(err: unknown): string | null {
  return err instanceof LoccyConfigError ? err.message : null
}

/** A file the guard actually governs, so a debug run with nothing named has something to show. */
async function anyTranslationFile(platform: Platform, config: LoccyConfig): Promise<string | null> {
  for (const module of Object.values(config.modules)) {
    const rm = await createResourceManager(platform, module)
    const [file] = rm ? rm.getFileLocaleMap().keys() : []
    if (file) return file
  }
  return null
}

/** The module whose translation glob covers `relativePath`, if any. */
export function moduleOwning(config: LoccyConfig, relativePath: string): string | null {
  for (const [name, module] of Object.entries(config.modules)) {
    const excluded = module.translations.exclude ?? []
    if (excluded.length && picomatch.isMatch(relativePath, excluded)) continue
    if (picomatch.isMatch(relativePath, module.translations.glob)) return name
  }
  return null
}

/** How long a denial leaves the file open, so a deliberate retry lands without a second refusal. */
const UNLOCK_MS = 5 * 60 * 1000

/**
 * Whether to redirect this edit at `loccy-tool`, which every attempt outside an open window is. The
 * marker's age is the window: a retry within it goes through, since the guard exists to catch an
 * agent reaching for the wrong tool, not to make a file unreachable when `loccy-tool` genuinely
 * cannot do the job. Once the window closes the next edit is redirected again, so a later change,
 * arriving with the reasoning that earned the exception long gone, is weighed afresh.
 */
async function redirect(sessionId: string, relativePath: string): Promise<boolean> {
  const digest = (value: string) => createHash('sha1').update(value).digest('hex').slice(0, 16)
  const dir = join(tmpdir(), 'loccy-tool-guard', digest(sessionId))
  const marker = join(dir, digest(relativePath))

  try {
    if (Date.now() - statSync(marker).mtimeMs < UNLOCK_MS) return false
  } catch {
    // No marker yet, so nothing has been said about this file.
  }

  try {
    await mkdir(dir, { recursive: true })
    await writeFile(marker, relativePath)
    return true
  } catch {
    // No way to remember the redirection means no way to let a retry through, and a guard that
    // cannot be got past would block every edit for the rest of the session.
    return false
  }
}

/**
 * PreToolUse guard on translation files. Editing one file at a time drifts the locales apart, so the
 * attempt is denied and answered with the `loccy-tool` command that does the same job properly.
 * A repeat of the same edit goes through: an agent that meant it (the user asked, or the CLI has no
 * way to express the change) is not something this guard should be able to lock out.
 * Anything it can't decide is allowed through, since failing closed would block unrelated work.
 */
export async function preEditHook(debug: boolean, file?: string): Promise<void> {
  const input = await readHookInput()
  const cwd = input?.cwd ?? process.cwd()
  const platform = createNodePlatform(cwd)

  let config: LoccyConfig | null
  try {
    config = await readConfigFile(platform)
  } catch (err) {
    // Not the same as having no config: calling a broken file absent sends a debug run looking for it.
    return silent(debug, reasonFor(err) ?? `${loccyConfigFilename} in ${cwd} does not load`)
  }
  if (!config) return silent(debug, `no ${loccyConfigFilename} in ${cwd}, so the guard governs nothing there`)

  // Named on the command line, else carried by the payload. A debug run with neither is answered
  // with a file the guard actually governs, so it has something to be shown about.
  const named = file ?? input?.tool_input?.file_path
  const filePath = named ?? (debug ? await anyTranslationFile(platform, config) : null)
  if (!filePath) return silent(debug, `no file named, and the translation globs matched none in ${cwd}`)

  const relativePath = isAbsolute(filePath) ? relative(cwd, filePath) : filePath
  if (relativePath.startsWith('..')) return silent(debug, `${filePath} is outside ${cwd}`)

  if (!moduleOwning(config, relativePath)) {
    return silent(debug, `${relativePath} matches no module's translations.glob`)
  }

  // A debug run gets a session of its own, since the window a real denial opens is not something a
  // replay should ever be silenced by.
  const session = debug ? `debug:${randomUUID()}` : (input?.session_id ?? 'no-session')
  if (!(await redirect(session, relativePath))) {
    return silent(debug, `${relativePath} is inside its ${UNLOCK_MS / 60000}-minute unlock window`)
  }

  emit(
    {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `${relativePath} holds translations, and those are written with loccy-tool upsert-message (see --help). ` +
          'If you do need to edit it by hand, repeat the edit and this lock lifts for the next 5 minutes.',
      },
    },
    debug,
  )
}

/**
 * SessionStart: put the project's own i18n setup and styleguide in context before the first message
 * is written, so the rules never have to be asked for. An unconfigured project gets the offer to run
 * setup instead, a broken config gets the parse error, and one with no translations gets nothing.
 */
export async function sessionStartHook(debug: boolean): Promise<void> {
  const input = await readHookInput()
  startLog()

  const cwd = input?.cwd ?? process.cwd()

  const context = await buildStartupContext(createNodePlatform(cwd)).catch(
    (err: unknown) =>
      `# Loccy\n\n\`${loccyConfigFilename}\` does not load, so every loccy-tool command will fail until it does:\n\n${reasonFor(err) ?? String(err)}`,
  )
  if (!context) return silent(debug, `no ${loccyConfigFilename} in ${cwd}, so the plugin has nothing to say there`)

  emit(
    {
      // The trace is never mentioned here: it exists to show what a session does unprompted, and
      // saying it is on would change that.
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
      suppressOutput: true,
    },
    debug,
  )
}
