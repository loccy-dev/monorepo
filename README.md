![Loccy](images/cover.png)

# Loccy

Modern i18n toolkit for React & Vue. Mostly free and open-source. All tools powered by a single `loccy.yaml` config. [Read docs.](https://loccy.dev/docs)

<br>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/extension-dark.png">
  <source media="(prefers-color-scheme: light)" srcset="images/extension-light.png">
  <img alt="Extension icon" src="images/extension-light.png" width="48">
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
  <img alt="Terminal icon" src="images/linter-light.png" width="48">
</picture>

## i18n linter

Keeps your translations clean and sorted. Catches unused or untranslated keys, or keys used in code but absent from translations. Before you ship it to production.

Perfect for CI/CD.

More → [apps/lint](apps/lint)

<br>

## Project structure

Turbo monorepo with shared logic extracted to `packages/`.

```
apps/
  ├── extension/      # VS Code extension
  └── lint/           # CLI linter
packages/
  ├── shared/         # core logic
  ├── types/          # shared types + config schema
  └── node-platform/  # node-specific platform bindings
```

<br>

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) and [TODO.md](TODO.md) for current priorities.

Ideas, questions, problems — all welcome in our [Discord](https://discord.gg/btztGrejXU).