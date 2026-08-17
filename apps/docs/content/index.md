---
title: Overview
description: "Loccy documentation: open-source i18n devtooling for React & Vue web apps."
updated: '2026-08-02'
---

# Loccy documentation

Loccy is open-source i18n devtooling for React & Vue web apps. It ships as two tools that share one configuration:

- **IDE extension**: preview, edit, extract, and translate strings inline in VS Code (and Cursor, Windsurf, and other VS Code-compatible editors). Core features are free; AI assistance comes with a Pro subscription.
- **Linter**: catches unused keys, missing translations, and unsorted translation files, locally and in CI — free and offline.

Both read the same [`loccy.yaml`](/docs/config) from your repository: configure once, use everywhere.

<!-- TEMP(JSON-CONFIG-MIGRATION): remove once legacy loccy.config.json users have migrated. -->
::info
Still on `loccy.config.json`? Loccy now configures via `loccy.yaml`. Run **Loccy: Migrate loccy.config.json to loccy.yaml** from the Command Palette to migrate.
::

## [Extension](/docs/extension)

- [Installation](/docs/extension/installation): install the extension and sign in
- [Core features](/docs/extension/core-features): inline previews, in-place editing, usage maps, renaming
- [AI features](/docs/extension/ai-features): extract, translate, and refine copy in the editor

## [Linter](/docs/linter)

- [Get started](/docs/linter): install the offline linter and set up `loccy.yaml`
- [Command reference](/docs/linter/commands): `init`, `lint`, and `format`

## Reference

- [Config](/docs/config): generate the config, plus every key, translation layout, and lint rules
- [Styleguide](/docs/config/styleguide): the AI guidance half of `loccy.yaml` (voice, per-language rules, glossary, key naming)
