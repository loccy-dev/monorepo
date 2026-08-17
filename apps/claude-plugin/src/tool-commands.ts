interface ToolCommand {
  usage: string
  /**
   * What the command does. The banner is the only place this renders, but keep it free of anything
   * positional anyway: a summary that points at its surroundings breaks the moment it moves.
   */
  summary: string
}

/** The command list, in one place, rendered by the CLI's own banner. */
const COMMANDS: ToolCommand[] = [
  { usage: 'init', summary: 'scaffold loccy.yaml, for a project that has none yet' },
  {
    usage: 'search [query...]',
    summary: 'read messages by text regex, --key <regex> (or `-` for a key list on stdin). --json',
  },
  { usage: 'upsert-message', summary: 'add or update keys across every locale (JSON on stdin)' },
  {
    usage: 'remove-message <key...>',
    summary: 'remove keys from every locale',
  },
  { usage: 'rename-key', summary: 'rename across locales and linked refs, source untouched (JSON on stdin)' },
  { usage: 'styleguide', summary: 'the writing rules, read whole before adding/editing translations' },
]

const WIDTH = Math.max(...COMMANDS.map((command) => command.usage.length))

/** Terse one-line-per-command list, for the CLI's own banner. */
function renderCommands(indent = '  '): string {
  return COMMANDS.map((command) => `${indent}${command.usage.padEnd(WIDTH)}  ${command.summary}`).join('\n')
}

/** The one shape every write takes, so there is never a second one to pick between. */
const BATCH_SYNTAX = `Writes are keyed by keypath on stdin, one key in the object or many: \`upsert-message\` reads
\`{key: {locale: value}}\`, \`rename-key\` reads \`{old: new}\`. \`remove-message\` takes keys as arguments.
Every batch is all-or-nothing: no file changes unless all of them can.`

/**
 * The tool in full: what it is for, every command it has, and how a batch is spelled. Printed for a
 * bare invocation and for -h/--help, and carried into the session briefing, so the command
 * reference exists once. A session gets the absolute path as `bin`, a terminal the plain name.
 */
export function workflow(bin = 'loccy-tool'): string {
  return `${bin}: CLI to manage i18n, designed for AI coding agents.
Use it instead of reading or editing translation files by hand. Don't grep, read or write them directly.

Translation files are all it touches. The keys in your source are yours: no call site is ever
written, moved or deleted here, so a key you add still has to be called, and one you rename or
remove leaves references behind for you to update.

${renderCommands()}

Never pipe output through head, tail or grep. Every output is meant to be read whole.

${BATCH_SYNTAX}

Pass --help to any command for details.`
}
