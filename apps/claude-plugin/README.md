# Loccy plugin for Claude Code (experimental)

Purpose of this plugin is to help Claude keep multilingual copy in healthy state:
- enforcing styleguide (tone, locale rules, terminology)
- keeping key names in sync with the copy

Also helps setup Loccy tools and author styleguide.

> [!NOTE]
> This plugin is experimental and not documented yet: commands, skills and behaviour are subject to
> change.

## Installation

macOS and Linux:

```
curl -fsSL https://raw.githubusercontent.com/loccy-dev/monorepo/main/apps/claude-plugin/install.sh | bash
```

Windows (PowerShell):

```
irm https://raw.githubusercontent.com/loccy-dev/monorepo/main/apps/claude-plugin/install.ps1 | iex
```

Adds the marketplace, installs the plugin, and turns auto-update on for it in `settings.json`.
Auto-update is off by default for marketplaces that are not Anthropic's own, and the plugin carries
the `loccy-tool` binary, so without it you stay on the version you installed. Skip it with
`--no-auto-update` (`-NoAutoUpdate`), reinstall with `--force` (`-Force`).

By hand instead: `claude plugin marketplace add loccy-dev/monorepo`, `claude plugin install loccy`,
then turn auto-update on in `/plugin`.

## How it works

- on startup (main or subagent): if `loccy.yaml` exists in project, give agent instruction to use `loccy-tool` for i18n edits
- on hand edit of a translation file: denied, agent redirected to `loccy-tool` (recommendation only: a repeat within 5 min goes through)
- on edit attempt via `loccy-tool` without passing styleguide hash input being rejected and agent asked to read current latest styleguide in full first. Hash is derived from the rules, so it dies the moment they change

enforcments/feedback along-the-way:
- `upsert-message` - regional locale repeating the value it already inherits from its parent
- `upsert-message` - static terminology checks (do-not-translate, glossary). Both false negatives and false positives exist; the latter is the agent's call, repeating the exact call writes the copy as-is
- `upsert-message` - copy of an existing key reworded: hint that the keypath may no longer describe its message, `rename-key` the ones that drifted

SKILLS
- `loccy-toolkit`: discovery when no config exists
- `author-styleguide`


## Debugging (dev)

| Hook | Debug twin | Payload field it needs |
| :--- | :--- | :--- |
| `hook-session-start` | `hook-session-start-debug` | `cwd` (defaults to the working directory) |
| `hook-subagent-start` | `hook-subagent-start-debug` | `cwd` (defaults to the working directory) |
| `hook-pre-edit` | `hook-pre-edit-debug [file]` | `tool_input.file_path`, or the `[file]` argument |

Run from the project root, so `cwd` needs no spelling out:

```
loccy-tool hook-session-start-debug
loccy-tool hook-pre-edit-debug locales/en.json
```

Set `LOCCY_DEBUG=1` to trace every invocation (arguments, stdin, output, exit code) to
`$TMPDIR/loccy-claude-plugin.log`, replaced at each session start.


## Links

[Website](https://loccy.dev) • [GitHub](https://github.com/loccy-dev/monorepo) • [Discord](https://discord.gg/btztGrejXU)
