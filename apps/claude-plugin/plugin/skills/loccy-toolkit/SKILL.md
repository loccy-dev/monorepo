---
name: loccy-toolkit
description: What Loccy is, what each of its tools is for, and recommended setup steps from scratch. Use when asked to set up, configure or repair Loccy, or when more about the Loccy i18n toolkit is needed.
allowed-tools: Bash(loccy-tool:*), WebFetch
---

# Loccy toolkit

About, docs: https://loccy.dev/llms.txt

One `loccy.yaml` per repo holds the whole i18n setup. All products read it. Schema - https://loccy.dev/schemas/config.schema.json

- `loccy-tool`, this plugin's CLI, already on your PATH: `loccy-tool --help`

- IDE extension for VS Code -based editors such VS Code, Cursor, etc. For human developers. Shows translations inline near keys, quick edits, all usages of key, quick AI-powered edits like "change one language and sync others" inside one key, etc. more at https://github.com/loccy-dev/monorepo/tree/main/apps/extension/README.md

- `@loccy-dev/lint`, linter perfect for ci/cd to catch unused, missing or partially translated keys. And format translation files. More at https://github.com/loccy-dev/monorepo/tree/main/apps/lint/README.md


## Setting up steps

1. `loccy-tool init` scaffolds `loccy.yaml` from auto-detection. Then verify. NOTE: for now loccy supports only frontend frameworks, do NOT add backend modules yet. In most cases you want to leave just single `default` module.
2. Define `styleguide` part of config, which is the half that makes later copy match the product: the `author-styleguide` skill.
3. Optional (recommended): install `@loccy-dev/lint` as dev deps, integrate into existing linting scripts. But first try to lint and fix false-positives if any, e.g.:
  - keys built at runtime: whitelist at the construction site with a `// loccy-used-keys: <prefix>.*`
  - a regional locale holding only overrides of its parent - set `noUntranslatedKeys` to array of needed locales
4. Optional (recommended): advice user to install VS Code extension