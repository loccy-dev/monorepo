import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dirname, join } from 'pathe'
import { baseProject, cleanupProject, makeProject, projectPath, writeProjectFile } from '../test/project'
import { run } from '../test/run-cli'
import { buildProgram } from '../program'

afterEach(cleanupProject)

describe('the hooks the plugin registers', () => {
  /** What the harness will run, read from the manifest it reads. */
  function manifestCommands(): string[] {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../plugin')
    const manifest = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf-8')) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }
    return Object.values(manifest.hooks)
      .flatMap((matchers) => matchers.flatMap((matcher) => matcher.hooks))
      .map(({ command }) => command.trim().split(/\s+/).at(-1)!)
  }

  // Nothing else connects the two: renamed on one side, every hook fails in real sessions only.
  it('names commands this CLI actually has, the manifest being the only thing wiring them', () => {
    const registered = buildProgram().commands.map((command) => command.name())

    expect(manifestCommands()).not.toHaveLength(0)
    for (const command of manifestCommands()) expect(registered).toContain(command)
  })

  // Windows reads no shebang, so a hook that runs the file itself never fires there at all.
  it('names node and the path the harness expands, neither of which a session has to find', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '../../plugin')
    const manifest = JSON.parse(readFileSync(join(root, 'hooks/hooks.json'), 'utf-8')) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>
    }

    const commands = Object.values(manifest.hooks)
      .flatMap((matchers) => matchers.flatMap((matcher) => matcher.hooks))
      .map(({ command }) => command)

    expect(commands).not.toHaveLength(0)
    for (const command of commands) expect(command).toMatch(/^node "\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/loccy-tool" \S+$/)
  })
})

/** The plugin root the harness expands, which under a test run is whatever launched it. */
const BIN = process.argv[1] ?? 'loccy-tool'

describe('the session briefing', () => {
  it('carries the whole setup, since a session opens on this and asks for nothing else', async () => {
    baseProject()
    const { additionalContext } = JSON.parse((await run(['hook-session-start'], '{}')).out).hookSpecificOutput

    expect(additionalContext.replaceAll(BIN, 'loccy-tool')).toBe(`## This project uses i18n

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
namespaces: none

Run loccy-tool by its full path: loccy-tool

loccy-tool: CLI to manage i18n, designed for AI coding agents.
Use it instead of reading or editing translation files by hand. Don't grep, read or write them directly.

Translation files are all it touches. The keys in your source are yours: no call site is ever
written, moved or deleted here, so a key you add still has to be called, and one you rename or
remove leaves references behind for you to update.

  init                     scaffold loccy.yaml, for a project that has none yet
  search [query...]        read messages by text regex, --key <regex> (or \`-\` for a key list on stdin). --json
  upsert-message           add or update keys across every locale (JSON on stdin)
  remove-message <key...>  remove keys from every locale
  rename-key               rename across locales and linked refs, source untouched (JSON on stdin)

Writes are keyed by keypath on stdin, one key in the object or many: \`upsert-message\` reads
\`{key: {locale: value}}\`, \`rename-key\` reads \`{old: new}\`. \`remove-message\` takes keys as arguments.
Every batch is all-or-nothing: no file changes unless all of them can.
Read \`upsert-message\` output whole, never piped or redirected: it is the feedback on your write,
and it is short.

Pass --help to any command for details.

Project doesn't use namespaces, never pass --ns.`)
  })

  it('shows the session start briefing as text, exactly as the harness is handed it', async () => {
    baseProject()
    const real = await run(['hook-session-start'], '{}')
    const context = JSON.parse(real.out).hookSpecificOutput.additionalContext

    expect(context).toContain('## This project')
    // Escaped in the payload, broken where the prose breaks in the debug view, same text in both.
    expect((await run(['hook-session-start-debug'], '{}')).out).toContain(context)
  })

  it('spells the tool with node on Windows, the path on its own not being runnable there', async () => {
    baseProject()
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })

    try {
      const { additionalContext } = JSON.parse((await run(['hook-session-start'], '{}')).out).hookSpecificOutput
      expect(additionalContext).toContain(`Run loccy-tool by its full path: node "${BIN}"

node "${BIN}": CLI to manage i18n, designed for AI coding agents.`)
    } finally {
      Object.defineProperty(process, 'platform', platform)
    }
  })

  it('briefs a subagent the same way, since it starts on a context of its own', async () => {
    baseProject()
    const session = JSON.parse((await run(['hook-session-start'], '{}')).out)
    const subagent = JSON.parse((await run(['hook-subagent-start'], '{}')).out)

    expect(subagent.hookSpecificOutput.hookEventName).toBe('SubagentStart')
    expect(subagent.hookSpecificOutput.additionalContext).toBe(session.hookSpecificOutput.additionalContext)
  })

  it('says nothing at all where the project has no config, costing a session it governs nothing', async () => {
    makeProject({ 'locales/en.json': '{"a":"b"}' })
    const session = await run(['hook-session-start'], '{}')
    const subagent = await run(['hook-subagent-start'], '{}')

    expect(session.code).toBe(0)
    expect(session.out).toBe('')
    expect(subagent.code).toBe(0)
    expect(subagent.out).toBe('')
  })
})

describe('the translation-file guard', () => {
  const hookInput = (sessionId: string) =>
    JSON.stringify({
      cwd: projectPath(''),
      session_id: sessionId,
      tool_input: { file_path: projectPath('locales/en.json') },
    })

  it('denies a hand edit of a file and lets a deliberate retry through', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`

    const first = await run(['hook-pre-edit'], hookInput(session))
    expect(JSON.parse(first.out)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'locales/en.json holds translations, and those are written with loccy-tool upsert-message ' +
          '(see --help). If you do need to edit it by hand, repeat the edit and this lock lifts for ' +
          'the next 5 minutes.',
      },
    })

    const second = await run(['hook-pre-edit'], hookInput(session))
    expect(second.out).toBe('')
  })

  it('denies again once the window a denial opened has closed', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`
    await run(['hook-pre-edit'], hookInput(session))

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000)
      const later = await run(['hook-pre-edit'], hookInput(session))
      expect(JSON.parse(later.out).hookSpecificOutput.permissionDecision).toBe('deny')
    } finally {
      vi.useRealTimers()
    }
  })

  it('hands the debug twin the same message, on a session the denial cannot silence', async () => {
    baseProject()
    const session = `test-${process.pid}-${Math.random()}`

    const real = await run(['hook-pre-edit'], hookInput(session))
    // Same session, so the real hook would already be inside the window it just opened.
    const debug = await run(['hook-pre-edit-debug'], hookInput(session))
    expect(debug.out).toContain(JSON.parse(real.out).hookSpecificOutput.permissionDecisionReason)
  })

  it('takes the file as an argument, so a replay needs no payload spelled out', async () => {
    baseProject()
    const { out } = await run(['hook-pre-edit-debug', 'locales/en.json'])
    expect(out).toBe(`{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "locales/en.json holds translations, and those are written with loccy-tool upsert-message (see --help). If you do need to edit it by hand, repeat the edit and this lock lifts for the next 5 minutes."
  }
}`)
  })

  it("falls back to the project's own translation file when the replay names none", async () => {
    baseProject()
    const { out } = await run(['hook-pre-edit-debug'])
    expect(out).toBe(`{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "locales/de.json holds translations, and those are written with loccy-tool upsert-message (see --help). If you do need to edit it by hand, repeat the edit and this lock lifts for the next 5 minutes."
  }
}`)
  })

  it.each(['src/app.ts', 'locales/en.json.bak', 'other-locales/en.json'])(
    'says nothing about %s, which no translation glob claims',
    async (file) => {
      baseProject()
      const input = JSON.stringify({
        cwd: projectPath(''),
        session_id: `test-${process.pid}-${Math.random()}`,
        tool_input: { file_path: projectPath(file) },
      })
      const { out, code } = await run(['hook-pre-edit'], input)
      expect({ out, code }).toEqual({ out: '', code: 0 })
    },
  )

  it('guards a file the edit would create, an unwritten locale drifting from the rest just as far', async () => {
    baseProject()
    const input = JSON.stringify({
      cwd: projectPath(''),
      session_id: `test-${process.pid}-${Math.random()}`,
      tool_input: { file_path: projectPath('locales/fr.json') },
    })

    const { out } = await run(['hook-pre-edit'], input)
    expect(JSON.parse(out).hookSpecificOutput.permissionDecision).toBe('deny')
  })

  it('says why it stood down where the config does not parse, rather than reading as absent', async () => {
    baseProject()
    writeProjectFile('loccy.yaml', 'modules: [this is not a module]\n')

    const { out, err } = await run(['hook-pre-edit-debug', 'locales/en.json'])
    expect(out).toBe('')
    expect(err).toBe(
      'no output: [loccy.config] modules.0.translations.glob is required ' +
        '— the glob for this module\'s translation files (e.g. "src/locales/**/*.json")',
    )
  })

  it.each([
    ['not JSON at all', 'this is not json'],
    ['no tool_input', '{"session_id":"x"}'],
    ['nothing at all', ''],
  ])('allows the edit through on hook input with %s, rather than blocking every edit', async (_case, input) => {
    baseProject()
    const { out, code, crashed } = await run(['hook-pre-edit'], input)
    expect({ out, code, crashed }).toEqual({ out: '', code: 0, crashed: false })
  })
})

describe('the upsert output guard', () => {
  const tool = '/plugins/loccy/bin/loccy-tool'
  const upsert = `${tool} upsert-message`
  const hookInput = (command: string, sessionId = `test-${process.pid}-${Math.random()}`) =>
    JSON.stringify({ session_id: sessionId, tool_input: { command } })

  const REASON =
    'upsert-message answers with the feedback on your write: the styleguide, or why nothing was ' +
    'written. Read it whole by running it with nothing piped or redirected after it. ' +
    'If you do need this exact command, repeat it.'
  const DENIED = {
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: REASON },
  }

  it.each([
    ['a pipe', `${upsert} --styleguided abc | tail -5`],
    ['a pipe after the stderr merge', `${upsert} --styleguided abc 2>&1 | head -3`],
    ['a stderr pipe', `${upsert} |& head`],
    ['a pipe on a heredoc-fed write', `cat <<'JSON' | ${upsert} | tail -3\n{"a":{"en":"x"}}\nJSON`],
    ['stderr thrown away', `${upsert} 2>/dev/null <<'JSON'\n{"a":{"en":"x"}}\nJSON`],
    ['stdout sent to a file', `${upsert} > out.txt`],
    ['both streams sent to a file', `${upsert} &> out.txt`],
  ])('denies %s, the feedback never read whole', async (_, command) => {
    const { out } = await run(['hook-pre-bash'], hookInput(command))
    expect(JSON.parse(out)).toEqual(DENIED)
  })

  it.each([
    ['a plain write', `${upsert} --styleguided abc`],
    ['stdin piped in', `cat <<'JSON' | ${upsert}\n{"a":{"en":"a | b"}}\nJSON`],
    ['stdin from a file', `${upsert} < values.json`],
    ['a here-string holding a pipe and a redirect', `${upsert} <<< '{"a":{"en":"Next > | x"}}'`],
    ['a pipe in the values, on a later line', `${upsert} <<'JSON'\n{"a":{"en":"a | b"}}\nJSON`],
    ['stderr merged into stdout', `${upsert} --styleguided abc 2>&1`],
    ['stdout merged into stderr', `${upsert} --styleguided abc >&2`],
    ['a fallback after it', `${upsert} --styleguided abc || echo failed`],
    ['a pipe in a later command', `${upsert} --styleguided abc && git diff | head`],
    ['a pipe after a semicolon', `${upsert} --styleguided abc; git status | head`],
    ['a search with a regex alternation', `${tool} search --key "Board\\.(created|rename)Description"`],
    ['a piped search', `${tool} search login | head -40`],
    ['a command that only names the tool', `grep -rn "loccy-tool upsert-message" src | head`],
    ['a quoted call handed to another command', `node x hook-pre-bash-debug '${upsert} 2>/dev/null'`],
    ['a command that never runs the tool', 'git log | head'],
  ])('says nothing about %s', async (_, command) => {
    const { out, code } = await run(['hook-pre-bash'], hookInput(command))
    expect({ out, code }).toEqual({ out: '', code: 0 })
  })

  it('lets the same command through on a repeat, so a misread never blocks the task', async () => {
    const session = `test-${process.pid}-${Math.random()}`
    const command = `${upsert} --styleguided abc | tail -5`

    const first = await run(['hook-pre-bash'], hookInput(command, session))
    expect(JSON.parse(first.out)).toEqual(DENIED)

    const second = await run(['hook-pre-bash'], hookInput(command, session))
    expect(second.out).toBe('')
  })

  it('takes the command as an argument, so a replay needs no payload spelled out', async () => {
    const { out } = await run(['hook-pre-bash-debug', `${upsert} | head`])
    expect(out).toBe(`{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "${REASON}"
  }
}`)
  })
})
