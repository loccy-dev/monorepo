import { Command, Option } from 'commander'
import { loccyConfigFilename } from '@repo/types/config.types'
import { LOCCY_SCHEMA_URL } from '@repo/shared/core/config'
import manifest from '../plugin/.claude-plugin/plugin.json'
import { initCommand } from './commands/init'
import { searchCommand } from './commands/search'
import { upsertMessageCommand } from './commands/upsert-message'
import { removeMessageCommand } from './commands/remove-message'
import { renameKeyCommand } from './commands/rename-key'
import { styleguideCommand, styleguideExampleCommand } from './commands/styleguide'
import { preEditHook, sessionStartHook } from './commands/hook'
import { workflow } from './tool-commands'

function withModuleOptions(command: Command): Command {
  return command.option('--module <name>', 'i18n module to target. Only needed where the project has several')
}

/** Namespace is a flag on every command that names keys, so a key is only ever a keypath. */
function withKeyOptions(command: Command): Command {
  return withModuleOptions(command).option(
    '--ns <namespace>',
    'Namespace the keys belong to (only needed where several hold the same keypath)',
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
      .description('Read messages: match a substring of any locale text, or of the key with --keys')
      .argument('<query...>', 'Text to search for (case-insensitive). Several terms are searched in one call')
      .option('--locale <locale>', 'Search and show only this locale')
      .option('--keys', 'Match the key instead of the text, for a key read out of source')
      .option('--limit <n>', 'Max matches to print in full, per term (default 10)'),
  )
    .addHelpText(
      'after',
      '\nText is what a term matches, so a word finds the messages that say it:\n\n' +
        '  loccy-tool search Reservierung --locale de\n' +
        '  loccy-tool search Reservierung Buchung Termin --locale de\n\n' +
        '--keys switches the whole search to keypaths, for the other question: which message is this\n' +
        'key from source, or what sits under this group.\n\n' +
        '  loccy-tool search login.title --keys\n' +
        '  loccy-tool search login --keys --ns admin\n\n' +
        'Each match prints its value in every locale and the source that uses it. Several terms get a\n' +
        'block each, in the order given, which is how a glossary candidate is checked for drift in one\n' +
        'call. Beyond the limit, matches are counted, not dropped.\n\n' +
        'A namespace goes in --ns, and a keypath is always bare.',
    )
    .action(searchCommand)

  withKeyOptions(
    program
      .command('upsert-message')
      .description('Add or update keys across every locale file in one call')
      // Deliberately undocumented: the command names this flag when it prints the styleguide, so
      // knowing it means having been shown the rules it certifies.
      .addOption(new Option('--styleguided <token>').hideHelp())
      .option('--force', 'Allow emptying the last locale while the key is still used'),
  )
    .addHelpText(
      'after',
      '\nKeys and values go in as JSON on stdin, so nothing needs shell-escaping. One key or many,\n' +
        'always keyed by keypath:\n\n' +
        "  loccy-tool upsert-message <<'EOF'\n" +
        '  {"login.title":{"en":"Sign in","de":"Anmelden"},"login.ok":{"en":"Continue","de":"Weiter"}}\n' +
        '  EOF\n\n' +
        'Run it with no stdin at all to get the exact locale set as a skeleton to fill.\n' +
        'A namespace goes in --ns, never spelled into the keys.\n\n' +
        'An empty string deletes the key from that locale file, leaving the others untouched: the way\n' +
        'to make one locale fall back while the rest keep their own text:\n\n' +
        '  {"login.ok":{"en":"Continue","de":"Weiter","de-AT":"","de-DE":""}}\n\n' +
        'Always enforced: every primary locale present in one call, and no partial-override locale\n' +
        'repeating the locale it extends. Nothing is written unless every key in the batch can be.',
    )
    .action(upsertMessageCommand)

  withKeyOptions(
    program
      .command('remove-message')
      .description('Remove keys from every locale file that holds them. Refuses while the code still uses one')
      .argument('<key...>', 'Keypaths to remove, e.g. login.title.')
      .option('--force', 'Remove even though usages remain (they will resolve to nothing)'),
  )
    .addHelpText(
      'after',
      '\n  loccy-tool remove-message login.old                  # i18n setup without namespaces\n' +
        '  loccy-tool remove-message login.old --ns auth        # namespaced i18n setup\n' +
        '  loccy-tool remove-message login.old signup.old       # several at once, all or nothing\n' +
        '\nA key still referenced in source is not removed: those calls would render the raw keypath.\n' +
        'Update the code first. Keys built at runtime are reported as dynamic and block the same way,\n' +
        'since the scanner cannot prove they are gone. A usage scan that cannot run blocks too.',
    )
    .action(removeMessageCommand)

  withKeyOptions(
    program.command('rename-key').description('Rename keys across locale files and rewrite static call sites'),
  )
    .addHelpText(
      'after',
      '\nRenames go in as JSON on stdin, one pair or many, applied all or nothing:\n\n' +
        "  loccy-tool rename-key <<'EOF'\n" +
        '  {"login.title":"login.heading","login.ok":"login.confirm"}\n' +
        '  EOF\n\n' +
        'A namespace goes in --ns, never spelled into the keys, and a rename never crosses one.\n' +
        'A key already in use is never renamed onto: merge deliberately with upsert-message, then remove-message.\n' +
        '\nKeys built at runtime cannot be matched reliably, so those usages are reported for a manual recheck.',
    )
    .action(renameKeyCommand)

  // No --module: one styleguide governs the project, whatever modules it splits its messages into.
  program.command('styleguide').description("The project's writing rules in full.").action(styleguideCommand)

  // Hidden: authoring a styleguide is what the skill is for, and a session that is not doing it has
  // no use for an example of one.
  program.command('styleguide-example', { hidden: true }).action(styleguideExampleCommand)

  addHookCommands(program)

  return program
}
