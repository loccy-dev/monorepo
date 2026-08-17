import { randomUUID } from 'node:crypto'
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
import { findProjectRoot } from '../project-root'
import { refuseOnce, UNLOCK_MS } from '../retry-window'
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
  // Globs are written relative to the config, and a session opens wherever the user is standing.
  const root = findProjectRoot(cwd)
  const platform = createNodePlatform(root)

  let config: LoccyConfig | null
  try {
    config = await readConfigFile(platform)
  } catch (err) {
    // Not the same as having no config: calling a broken file absent sends a debug run looking for it.
    return silent(debug, reasonFor(err) ?? `${loccyConfigFilename} in ${root} does not load`)
  }
  if (!config) return silent(debug, `no ${loccyConfigFilename} at or above ${cwd}, so the guard governs nothing there`)

  // Named on the command line, else carried by the payload. A debug run with neither is answered
  // with a file the guard actually governs, so it has something to be shown about.
  const named = file ?? input?.tool_input?.file_path
  const filePath = named ?? (debug ? await anyTranslationFile(platform, config) : null)
  if (!filePath) return silent(debug, `no file named, and the translation globs matched none in ${root}`)

  const relativePath = isAbsolute(filePath) ? relative(root, filePath) : relative(root, join(cwd, filePath))
  if (relativePath.startsWith('..')) return silent(debug, `${filePath} is outside ${root}`)

  if (!moduleOwning(config, relativePath)) {
    return silent(debug, `${relativePath} matches no module's translations.glob`)
  }

  // A debug run gets a session of its own, since the window a real denial opens is not something a
  // replay should ever be silenced by.
  const session = debug ? `debug:${randomUUID()}` : (input?.session_id ?? 'no-session')
  if (!(await refuseOnce(`edit:${session}`, relativePath))) {
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
 * The briefing both start hooks carry: the project's own i18n setup and styleguide, in context before
 * the first message is written, so the rules never have to be asked for. A project with no
 * `loccy.yaml` is answered with nothing at all, a broken one with the parse error.
 * `argv[1]` is the plugin root the harness expanded, which is the path a session runs the tool by.
 */
async function brief(event: 'SessionStart' | 'SubagentStart', debug: boolean): Promise<void> {
  const input = await readHookInput()
  const cwd = input?.cwd ?? process.cwd()
  const bin = process.argv[1] ?? 'loccy-tool'

  const context = await buildStartupContext(createNodePlatform(findProjectRoot(cwd)), bin).catch(
    (err: unknown) =>
      `# Loccy\n\n\`${loccyConfigFilename}\` does not load, so every ${bin} command will fail until it does:\n\n${reasonFor(err) ?? String(err)}`,
  )
  if (!context)
    return silent(debug, `no ${loccyConfigFilename} at or above ${cwd}, so there is no i18n setup to describe`)

  emit(
    {
      // The trace is never mentioned here: it exists to show what a session does unprompted, and
      // saying it is on would change that.
      hookSpecificOutput: { hookEventName: event, additionalContext: context },
      suppressOutput: true,
    },
    debug,
  )
}

/** SessionStart: the briefing, and the point the trace starts over from. */
export async function sessionStartHook(debug: boolean): Promise<void> {
  startLog()
  await brief('SessionStart', debug)
}

/**
 * SubagentStart: the same briefing, since a subagent starts on its own context and would otherwise
 * reach for i18n files with none of it. The trace is left alone here, as a subagent starting is not
 * the session starting.
 */
export async function subagentStartHook(debug: boolean): Promise<void> {
  await brief('SubagentStart', debug)
}
