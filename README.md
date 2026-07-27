![Loccy](images/cover.png)

# Loccy

**AI-powered i18n devtooling for React & Vue.** An editor extension and a linter that share one config. Set up your translations once, keep them clean everywhere.

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code-install-007ACC?logo=visualstudiocode&logoColor=white)](https://marketplace.visualstudio.com/items?itemName=loccy.loccy)
[![Open VSX](https://img.shields.io/badge/Open%20VSX-install-C160EF)](https://open-vsx.org/extension/loccy/loccy)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/btztGrejXU)

Supports **react-i18next**, **next-intl**, and **vue-i18n**. Auto-detects your setup. Zero config to start.

## What's inside

Two tools, one shared `loccy.yaml`:

### 🧩 IDE extension · [`apps/extension`](apps/extension)

AI i18n helper for VS Code, Cursor, and other VS Code–compatible editors. Inline translation previews, in-place editing, keypath renaming, and fine-tuned AI workflows: extract static text to a translated message, sync all locales after one edit, auto-fill empty translations, refine draft copy.

Basics are free; AI assistance is $6/mo or $49/yr (30 free requests to start).

**Install:** [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=loccy.loccy) · [Open VSX](https://open-vsx.org/extension/loccy/loccy)

### 🔎 i18n linter for React & Vue · [`apps/lint`](apps/lint) · [`@loccy-dev/lint`](https://www.npmjs.com/package/@loccy-dev/lint)

Catches unused keys, missing/empty translations, keys used in code but absent from translations, and unsorted files, locally and in CI.

**→ [Install & usage](apps/lint/README.md)**

## Repo layout

```
apps/
  extension/      VS Code extension (the published product)
  lint/           i18n linter + config initializer (@loccy-dev/lint)
packages/
  shared/         core i18n logic (browser + node)
  node-platform/  node-specific platform bindings
  types/          shared types + config schemas
```

Built with [pnpm](https://pnpm.io) + [Turborepo](https://turborepo.com). Setup, dev, and how to run the extension → [CONTRIBUTING.md](CONTRIBUTING.md).

## Contributing

Contributions welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [TODO.md](TODO.md) for current priorities.

## Links

- 🌐 [loccy.dev](https://loccy.dev): website, docs, subscription management
- 💬 [Discord](https://discord.gg/btztGrejXU): news, bug reports, feature requests
- ✉️ [hello@loccy.dev](mailto:hello@loccy.dev)

## License

Loccy's open-source packages (`apps/lint`, `apps/extension`, and the shared `packages/*`) are [MIT](https://opensource.org/licenses/MIT) licensed. `apps/web` is a private backend and not open-sourced.
