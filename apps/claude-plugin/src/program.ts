import { Command } from 'commander'
import { loccyConfigFilename } from '@repo/types/config.types'
import { LOCCY_SCHEMA_URL } from '@repo/shared/core/config'
import manifest from '../plugin/.claude-plugin/plugin.json'
import { initCommand } from './commands/init'
import { searchCommand } from './commands/search'
import { upsertMessageCommand } from './commands/upsert-message'
import { removeMessageCommand } from './commands/remove-message'
import { renameKeyCommand } from './commands/rename-key'
import { styleguideCommand, styleguideExampleCommand } from './commands/styleguide'
import { preEditHook, sessionStartHook, subagentStartHook } from './commands/hook'
import { workflow } from './tool-commands'

function withModuleOptions(command: Command): Command {
  return command.option('--module <name>', 'i18n module to target. Only needed where the project has several')
}

/** Namespace is a flag on every command that names keys, so a key is only ever a keypath. */
function withKeyOptions(command: Command): Command {
  return withModuleOptions(command).option(
    '--ns <namespace>',
    'Namespace the keys belong to (only needed if setup is multi-namespaced (e.g. in react-i18next with <locale>/{<ns1>.json, <ns2>.json}) structure)',
  )
}

/**
 * The plugin's hooks, each with a `-debug` twin printing the same payload laid out. The harness
 * always pipes the payload in; the twin takes what a person would rather than spell that JSON, so
 * it also names the one field the payload would have carried. Hidden either way: what a hook does
 * is the plugin's business, not a session's. The twin is the same entry point rather than a
 * reproduction of it, so what it shows cannot drift.
 */
function addHookCommands(program: Command): void {
  const hooks: {
    name: string
    run: (debug: boolean, value?: string) => Promise<void>
    argument?: [usage: string, description: string]
  }[] = [
    { name: 'hook-session-start', run: sessionStartHook },
    { name: 'hook-subagent-start', run: subagentStartHook },
    {
      name: 'hook-pre-edit',
      run: preEditHook,
      argument: ['[file]', "Translation file the edit would touch. Omit it and the project's own is used"],
    },
  ]

  for (const { name, run, argument } of hooks) {
    program.command(name, { hidden: true }).action(() => run(false))

    const debug = program.command(`${name}-debug`, { hidden: true })
    if (argument) debug.argument(...argument).action((value?: string) => run(true, value))
    else debug.action(() => run(true))
  }
}

/**
 * Every command the CLI accepts. Built rather than exported ready-made so nothing runs on import:
 * the entry point owns argv, and the tests own an instance of their own.
 */
export function buildProgram(): Command {
  const program = new Command()
  program.name('loccy-tool').version(manifest.version, '-v, --version').showHelpAfterError(workflow())

  program
    .command('init')
    .description(`Scaffold ${loccyConfigFilename} from auto-detection. Only for a project that has none yet`)
    .addHelpText(
      'after',
      `\nEvery other command reads ${loccyConfigFilename}, so this is the one to run first. It never\n` +
        `overwrites an existing file: edit that one, against the field reference at ${LOCCY_SCHEMA_URL}`,
    )
    .action(initCommand)

  withKeyOptions(
    program
      .command('search')
      .description('Read messages: match locale text, the keypath, or both at once. Queries are regular expressions')
      .argument('[query...]', 'Pattern the text must match (case-insensitive). Several are searched in one call')
      .option(
        '--key <pattern>',
        'Keypath to match, narrowing the text query rather than replacing it. `-` reads exact keypaths from stdin, one per line',
      )
      .option('--locale <locale>', 'Search and show only this locale')
      .option('--json', 'Print the whole call as one JSON document, for joining against something else')
      .option('--limit <n>', 'Max matches to print in full, per term. Uncapped unless you say so'),
  )
    .addHelpText(
      'after',
      '\nEvery query is a case-insensitive regular expression, over the text by default:\n\n' +
        '  loccy-tool search Reservierung --locale de\n' +
        '  loccy-tool search Reservierung Buchung Termin --locale de\n' +
        "  loccy-tool search 'Could ?n.t' --locale en\n\n" +
        '--key matches the keypath instead, for the other question: which message is this key from\n' +
        'source, or what sits under this group. Alone it is the whole search; with a term it narrows it.\n\n' +
        '  loccy-tool search --key login\n' +
        "  loccy-tool search --key '^Tickets\\..*Tooltip$'\n" +
        "  loccy-tool search '\\.$' --key '^(?!.*[Tt]ooltip)' --locale en\n\n" +
        'A phrase out of the UI is the same thing with its pattern characters escaped:\n\n' +
        '  loccy-tool search "Are you sure\\? \\(optional\\)"\n\n' +
        'Keep patterns simple: nested quantifiers can hang the search.\n\n' +
        'Holding a key list already, from a grep over the source that calls them, pipe it in and read\n' +
        'the values back rather than opening the locale files. Those are matched exactly, never as\n' +
        'patterns:\n\n' +
        '  grep -rhoE "t\\(\x27[A-Za-z0-9_.]+\x27\\)" src | sed -E "s/.*\x27(.*)\x27.*/\\1/" | sort -u \\\n' +
        '    | loccy-tool search --key - --locale en --json\n\n' +
        '--json prints one document per call: every block, its total, and each match with the value\n' +
        'each locale holds. That is the form to join against grep output or feed to jq.\n\n' +
        'Each match prints its value in every locale. Several terms get a block each, in the order\n' +
        'given, which is how a glossary candidate is checked for drift in one call.\n\n' +
        'A namespace goes in --ns, and a keypath is always bare.',
    )
    .action(searchCommand)

  withKeyOptions(
    program
      .command('upsert-message')
      .description('Add or update keys across locale files, multiple locales in one call')
      .option(
        '--styleguided <token>',
        'Confirm the rules were read. `loccy-tool styleguide` prints them and the token that goes here',
      ),
  )
    .addHelpText(
      'after',
      '\nJSON on stdin, keyed by keypath. Cheapest is one call carrying every key and locale you are\n' +
        'changing:\n\n' +
        "  loccy-tool upsert-message <<'EOF'\n" +
        '  {"login.title":{"en":"Sign in","de":"Anmelden"},"login.ok":{"en":"Continue","de":"Weiter"}}\n' +
        '  EOF\n\n' +
        'Only the locales you pass are written. "" deletes the key\n' +
        'from that locale:\n\n' +
        '  {"login.ok":{"en":"Success","en-US":""}}\n\n' +
        'Run `loccy-tool styleguide` before the first call and read it in full',
    )
    .action(upsertMessageCommand)

  withKeyOptions(
    program
      .command('remove-message')
      .description('Remove keys from every locale file that holds them')
      .argument('<key...>', 'Keypaths to remove, e.g. login.title.'),
  )
    .addHelpText(
      'after',
      '\n  loccy-tool remove-message login.old                  # i18n setup without namespaces\n' +
        '  loccy-tool remove-message login.old --ns auth        # namespaced i18n setup\n' +
        '  loccy-tool remove-message login.old signup.old       # several at once, all or nothing',
    )
    .action(removeMessageCommand)

  withKeyOptions(program.command('rename-key').description('Rename keys across every locale file'))
    .addHelpText(
      'after',
      '\nRenames go in as JSON on stdin, one pair or many, applied all or nothing:\n\n' +
        "  loccy-tool rename-key <<'EOF'\n" +
        '  {"login.title":"login.heading","login.ok":"login.confirm"}\n' +
        '  EOF\n\n' +
        'A namespace goes in --ns, never spelled into the keys, and a rename never crosses one.\n' +
        'A key already in use is never renamed onto: merge deliberately with upsert-message, then remove-message.\n' +
        '\nLinked references between messages (`@:old.key`) follow the rename.',
    )
    .action(renameKeyCommand)

  // No --module: one styleguide governs the project, whatever modules it splits its messages into.
  program
    .command('styleguide')
    .description("The project's writing rules in full. Read all of it, never a slice")
    .addHelpText(
      'after',
      '\nRead the output whole, and again whenever the rules may have moved: a write is checked against\n' +
        'these rules, and only what is in context can be written against. Piping this through head, tail\n' +
        'or grep keeps the token at the end and drops the rules it stands for, leaving the next write\n' +
        'confirming something nobody read.',
    )
    .action(styleguideCommand)

  // Hidden: authoring a styleguide is what the skill is for, and a session that is not doing it has
  // no use for an example of one.
  program.command('styleguide-example', { hidden: true }).action(styleguideExampleCommand)

  addHookCommands(program)

  return program
}
