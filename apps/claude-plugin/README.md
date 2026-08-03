# Loccy plugin for Claude Code (experimental)

- Makes sure the agent is styleguide-aware every time it adds or edits translations (tone, terminology, etc.)
- Tooling for faster CRUD on messages e.g. `echo '{"login.title":{"en":"Sign in","de":"Anmelden"}}' | loccy-tool upsert-message` writes every locale at once, instead of finding the translation files and patching each one separately
- Help across the Loccy ecosystem: setup from scratch, styleguide authoring, and the rest


Reads the same `loccy.yaml` as the [IDE extension](../extension) and the [linter](../lint).

Self-contained, free, no API key needed.

> [!NOTE]
> This plugin is experimental and not documented yet: commands, skills and behaviour are subject to
> change. Early feedback is worth a lot at this stage, and very welcome in our
> [Discord](https://discord.gg/btztGrejXU).

## Installation

```
claude plugin marketplace add loccy-dev/monorepo --scope project
claude plugin install loccy --scope project
```

## Skills

| Skill | For |
| :--- | :--- |
| `loccy-toolkit` | what Loccy is, and first-time setup |
| `author-styleguide` | writing down the rules every translation is checked against |

## Tools

`loccy-tool` ships in the plugin at `${CLAUDE_PLUGIN_ROOT}/bin/loccy-tool`. The SessionStart hook puts its absolute path in context, and a session calls it by that path.

| | |
| :--- | :--- |
| read | `search` |
| write | `upsert-message` `rename-key` `remove-message` |
| rules | `styleguide` |
| setup | `init` |

## Hooks

- The project's i18n setup lands in context at session start, in a project that has `loccy.yaml`. Nothing at all in one that doesn't.
- A hand edit of a translation file is stopped, so edits go through the fast, styleguide-checked gate instead (recommendation only: a retry within five minutes goes through).

### Running a hook by hand

Each hook is a hidden `loccy-tool` command, fed the harness payload as JSON on stdin. Run one with
nothing piped in and it reads an empty payload, decides it has nothing to say, and prints nothing:
that is the hook working, not a broken one.

Every hook has a `-debug` twin. Same entry point, same decision, so what it shows cannot drift from
what the harness gets. It differs in three ways: the JSON is laid out rather than one line, text is
printed with its line breaks instead of `\n`, and a hook that stays silent says why on stderr.

| Hook | Debug twin | Payload field it needs |
| :--- | :--- | :--- |
| `hook-session-start` | `hook-session-start-debug` | `cwd` (defaults to the working directory) |
| `hook-pre-edit` | `hook-pre-edit-debug [file]` | `tool_input.file_path`, or the `[file]` argument |

Run from the project root, so `cwd` needs no spelling out:

```
loccy-tool hook-session-start-debug
loccy-tool hook-pre-edit-debug locales/en.json
```

`hook-pre-edit-debug` with no file falls back to a translation file the guard governs, so it always
has something to show. It also runs on a session of its own, so the five-minute unlock window a real
denial opens can never silence a replay.

Set `LOCCY_DEBUG=1` to trace every invocation (arguments, stdin, output, exit code) to
`$TMPDIR/loccy-claude-plugin.log`, replaced at each session start.


## Links

[Website](https://loccy.dev) • [GitHub](https://github.com/loccy-dev/monorepo) • [Discord](https://discord.gg/btztGrejXU)
