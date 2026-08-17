![Loccy](images/cover.png)

# Loccy

Modern i18n toolkit for React & Vue. Mostly free and open-source. All tools powered by a single `loccy.yaml` config. [Read docs.](https://loccy.dev/docs)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/extension-vscode-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="images/extension-vscode-light.png">
  <img alt="Extension icon" src="images/extension-vscode-light.png" height="48">
</picture>

## Editor extension

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-install-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=loccy.loccy)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-install-C160EF)](https://open-vsx.org/extension/loccy/loccy)

Inline translation previews, in-place editing, keypath renaming, and quick, fine-tuned AI-powered actions: extract static text to a translated message, sync all locales after one edit, auto-fill empty translations, [etc.](https://loccy.dev/docs/extension/ai-features) Offline features are free, AI actions require a small subscription which also helps fund the project.

Compatible with all VS Code based editors.

More → [apps/extension](apps/extension)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/linter-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="images/linter-light.png">
  <img alt="Terminal icon" src="images/linter-light.png" height="48">
</picture>

## i18n linter

Keeps your translations clean and sorted. Catches unused or untranslated keys, or keys used in code but absent from translations. Before you ship it to production.

Perfect for CI/CD.

```bash
npm i -D @loccy-dev/lint
```

More → [apps/lint](apps/lint)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/extension-claude-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="images/extension-claude-light.png">
  <img alt="Claude Code plugin icon" src="images/extension-claude-light.png" height="48">
</picture>

## Claude Code plugin (experimental)

Helps Claude keep multilingual copy in healthy state:
- enforcing styleguide (tone, locale rules, terminology)
- keeping key names in sync with the copy

A hand edit of a translation file is denied and redirected to `loccy-tool`, which writes every locale at once: `echo '{"login.title":{"en":"Sign in","de":"Anmelden"}}' | loccy-tool upsert-message`. Nothing is written until the copy has been checked against the styleguide the project authored.

Also helps setup Loccy tools and author styleguide.

```
curl -fsSL https://raw.githubusercontent.com/loccy-dev/monorepo/main/apps/claude-plugin/install.sh | bash
```

Windows: `irm https://raw.githubusercontent.com/loccy-dev/monorepo/main/apps/claude-plugin/install.ps1 | iex`

Installs the plugin and turns auto-update on for it, which Claude Code leaves off by default.

More → [apps/claude-plugin](apps/claude-plugin)


## Project structure

Turbo monorepo with shared logic extracted to `packages/`.

```
apps/
  ├── extension/      # VS Code extension
  ├── lint/           # CLI linter
  ├── claude-plugin/  # Claude Code plugin
  └── docs/           # docs content published at loccy.dev/docs
packages/
  ├── shared/         # core logic
  ├── types/          # shared types + config schema
  └── node-platform/  # node-specific platform bindings
```

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) and [TODO.md](TODO.md) for current priorities.

Ideas, questions, problems — all welcome in our [Discord](https://discord.gg/btztGrejXU).