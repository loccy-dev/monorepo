---
title: Config
description: "Reference for loccy.yaml: modules, keys, types, defaults, and translation layout."
---

# Config

`loccy.yaml` at your repo root is the single source of truth for both the [IDE extension](/docs/extension) and the [linter](/docs/linter). It has two halves: the mechanical setup on this page, organized as one or more **modules** (each pairs code `usages` with stored `translations`), plus the hand-authored [`styleguide`](/docs/config/styleguide) that steers every AI translation.

An empty file is valid — it means "detect everything." That only covers the mechanical half, though: the `styleguide` used by [AI actions](/docs/extension/ai-features) cannot be auto-detected.

## Generating the config

Run **Loccy: Create Config File** (IDE Command Palette) or [`npx loccy init`](/docs/linter/commands#loccy-init). Both write a single `loccy.yaml` with the detected mechanical config, plus a commented-out styleguide scaffold; edit the written values to pin or change what Loccy inferred.

The written values come from inspecting your repo:

| Key | Detected from |
| --- | --- |
| `framework` | Dependencies: `react-i18next`, `next-intl`, `vue-i18n`, or others |
| `translations.glob` | The most likely translation directory |
| `translations.layout` | Whether files are per-locale (`{locale}.json`) or per-namespace (`{locale}/{namespace}.json`) |
| `usages.include` | A glob matching your code (e.g. `.vue`, `.tsx`) |

If no supported i18n library or translation files are found, a placeholder is written; set `framework` and `translations.glob` by hand.

To verify, open a file with translation keys and check the inline previews (IDE), or run [`npx loccy lint`](/docs/linter/commands#loccy-lint).

The generated file starts with a `# yaml-language-server: $schema=...` comment. Keep it: editors with the YAML language server use it for autocomplete, inline docs, and validation.

## Full example

Nothing is required: every key below is an override of an auto-detected value. This is a single-module setup, with one entry under `modules`, conventionally named `default`; see [Modules](#modules) for the multi-module form. The [`styleguide`](/docs/config/styleguide) sits alongside `modules`, at the top level.

```yaml
modules:
  default:
    framework: react-i18next

    translations:
      glob: 'public/locales/**/*.json'
      exclude: ['public/locales/en-US/**.json']
      layout: '{locale}/{namespace}.json'
      # storage-side lint rules
      noUntranslatedKeys: true
      sortKeys: true

    usages:
      include: ['src/**/*.{js,ts,jsx,tsx}']
      exclude: ['src/**/*.test.tsx']
      customTFunctions: ['translate']
      detectKeysInStrings: true
      defaultNamespace: translation
      # usage-side lint rules
      noUnresolvedKeys:
        enabled: true
        excludeKeys:
          - 'Common.Language.*' # dynamic $t(`Common.Language.${code}`)
      noUnusedKeys: true

styleguide:
  # see /docs/config/styleguide
```

## Modules

A **module** is one i18n setup: how keys are used in code (`usages`) paired with how they're stored (`translations`). Splitting the two axes lets a module scan usages one way and store translations another: e.g. a custom t-function on the usage side with a non-JSON storage format on the storage side.

Every repo defines `modules` explicitly, even a single-setup repo, as one entry conventionally named `default`:

```yaml
modules:
  default:
    framework: react-i18next
    translations:
      glob: 'public/locales/**/*.json'
      layout: '{locale}/{namespace}.json'
    usages:
      include: ['src/**/*.{ts,tsx}']
```

Multi-setup repos add more entries to the same `modules` map, keyed by module name. Each entry takes the same `framework`/`translations`/`usages` keys:

```yaml
modules:
  frontend:
    framework: vue-i18n
    translations:
      glob: 'apps/web/src/locales/**/*.json'
      layout: '{locale}/{namespace}.json'
    usages:
      include: ['apps/web/**/*.{vue,ts}']

  backend:
    # Decoupled setup: no framework preset, so usages come only from a custom
    # wrapper, and translations are stored as YAML rather than JSON (the
    # `.yaml` extension on `glob` is what picks the resource format).
    translations:
      glob: 'services/api/locales/*.yaml'
      layout: '{locale}.yaml'
    usages:
      include: ['services/api/**/*.ts']
      customTFunctions: ['i18n.translate']
      detectKeysInStrings: false
      noUnusedKeys: false # opt out for this module only
```

The global key, [`styleguide`](/docs/config/styleguide), always sits at the top level, alongside `modules`. Lint rules aren't global either — each lives on the [`translations`](#translations)/[`usages`](#usages) axis it checks.

**Module selection.** Multi-module setups are fully supported in the IDE: each file resolves to its module automatically, by matching `translations.glob`/`usages.include`. [`loccy lint`](/docs/linter/commands#loccy-lint) and [`loccy format`](/docs/linter/commands#loccy-format) iterate every module — there's no way yet to target just one.

The next three sections document a module's fields, which live under each `modules.<name>` entry: [`framework`](#framework), [`translations`](#translations), [`usages`](#usages).

## `framework`

```yaml
framework: react-i18next
```

The usage-detection preset (how keys are read from source code). One of `react-i18next`, `next-intl`, `vue-i18n`, or `custom`: no preset, scans only `t(...)`, any `usages.customTFunctions`, and bare-string matches. Defaults to `custom` when omitted; auto-detected from dependencies for the `default` module.

`framework` also seeds the default for [`messageFormat`](#messageformat) but is otherwise decoupled from storage — any framework can pair with any storage format (see [`translations`](#translations)).

## `translations`

```yaml
translations:
  glob: 'public/locales/**/*.json'
  exclude: ['public/locales/en-US/**.json']
  layout: '{locale}/{namespace}.json'
```

The storage side: where translation files live and how paths map to locales and namespaces.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `glob` | string | auto-detected | Single glob for this module's translation files |
| `layout` | string \| map | auto-detected | Pattern mapping paths to locales and namespaces (see [Layout patterns](#layout-patterns)) |
| `messageFormat` | string | auto-resolved | Plural encoding (see [`messageFormat`](#messageformat)) |
| `exclude` | string[] | `[]` | Globs to exclude from `glob` |
| `noUntranslatedKeys` | boolean \| string[] | `true` | Lint: every locale has a non-empty translation. `true` checks every detected locale; a list of locale codes checks exactly those, for locales that are deliberately incomplete |
| `sortKeys` | boolean | `false` | Lint: keep keys deeply sorted — the IDE enforces it on every write, [`loccy format`](/docs/linter/commands#loccy-format) on demand |

The resource file format (`json`, `yaml`, `ts-object`, `php-array`, `properties`) is not a config field: it's always derived from `glob`'s file extension.

Key-naming and code-organization guidance for the AI lives in [`styleguide.keys`](/docs/config/styleguide), not here.

### Layout patterns

Tells Loccy which path segments are the locale and namespace. The static prefix of `glob` is stripped, then the remainder is matched against the pattern: with `glob: 'src/locales/**/*.json'`, `src/locales/en/common.json` matches as `en/common.json`.

| Placeholder | Matches |
| --- | --- |
| `{locale}` | A locale code (`en`, `de`, `en-US`, `zh-Hans`) |
| `{namespace}` | A single path segment |

Within a segment, `*` matches any run of non-slash characters. Files that don't match fall back to treating the filename as the locale.

| Layout | `layout` |
| --- | --- |
| `locales/en.json` (one file per locale) | `{locale}.json` |
| `public/locales/en/common.json` (file per namespace) | `{locale}/{namespace}.json` |

For irregular conventions, such as a suffix-less default file, `layout` may instead be a **per-locale map** keyed by locale code, with `*` as the fallback:

```yaml
translations:
  glob: 'src/i18n/**/*.properties'
  layout:
    en: 'messages.properties'
    '*': 'messages_{locale}.properties'
```

### Nested vs flat keys

Both are supported and detected per file: nested when any top-level value is an object, flat when all are primitives. Loccy preserves the detected structure, indentation, and trailing newlines when writing.

```json
{ "settings": { "title": "Settings" } }
```

```json
{ "settings.title": "Settings" }
```

### `messageFormat`

```yaml
translations:
  messageFormat: icu
```

How plurals are encoded (`translations.messageFormat`). **Auto-resolved** from `framework` and your dependencies (e.g. `icu` when `i18next-icu` is installed); set it only to override.

| Format | Plural shape | Typical setup |
| --- | --- | --- |
| `suffix-cldr` | Sibling keys `items_one`, `items_other`, … | i18next (default) |
| `icu` | Inline `{count, plural, one {…} other {…}}` | next-intl; i18next with `i18next-icu` |
| `vue-pipe` | Pipe segments `no items \| one item \| {count} items` | vue-i18n |

Loccy uses the message format to expand plural key usages (for key-based formats) and to derive the resource storage shape. AI-generated plurals and the lint plural-completeness check are both temporarily off while plural-arity detection is reworked; `messageFormat` today only drives usage-key expansion and resource shape.

## `usages`

```yaml
usages:
  include: ['src/**/*.{js,ts,jsx,tsx}']
  exclude: ['src/**/*.test.tsx']
  customTFunctions: ['translate']
  detectKeysInStrings: true
  defaultNamespace: translation
```

The usage side: how source code is scanned for key usages.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `include` | string[] | auto-detected | Globs for source files to scan |
| `exclude` | string[] | `[]` | Globs to exclude |
| `customTFunctions` | string[] | `[]` | Extra t-function names beyond framework defaults |
| `detectKeysInStrings` | boolean | `true` | Match bare string literals against known keys |
| `quoteType` | `'single'` \| `'double'` | auto | Quote style for inserted t-function calls. Omit to auto-detect from the codebase |
| `defaultNamespace` | string | none | Default t-function namespace. `react-i18next` only |
| `noUnresolvedKeys` | boolean \| object | `true` | Lint: keys used in code exist in translations. Object form: `{ enabled, excludeKeys }` |
| `noUnusedKeys` | boolean | `true` | Lint: flag unused keys — removed by `loccy lint --fix` |

Both only count keys that resolve to a static string: runtime keys like `` t(`status.${state}`) `` are skipped, not flagged, but the translation keys they cover (`status.active`, `status.done`, …) look unreferenced. Exclude `noUnresolvedKeys` false positives with `excludeKeys` (patterns are `namespace:keypath`, or bare `keypath` with no namespace; `*` globs match a key or `prefix.` segment). For `noUnusedKeys`, whitelist the construction site instead with a `// loccy-used-keys: status.*` comment — config can't reach into source, and the comment goes away with the code it annotates.
