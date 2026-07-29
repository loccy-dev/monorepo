# Loccy i18n linter

Keeps translations for React & Vue apps clean and sorted. Catches unused keys, missing or empty translations, and keys used in code but absent from translations. Locally and in CI.

Part of [Loccy](https://loccy.dev), open-source i18n devtooling. Reads the same `loccy.yaml` as the [editor extension](https://marketplace.visualstudio.com/items?itemName=loccy.loccy): configure once, use everywhere.

## Install

```bash
npm i -D @loccy-dev/lint
```

Requires Node.js >= 18.

## Set up

Loccy needs a `loccy.yaml`. Create it once, then commit it.

Fastest, let your AI agent do it:

```bash
npx loccy init-prompt | pbcopy   # paste into your coding agent
```

Or do it yourself:

```bash
npx loccy init                   # scaffold from auto-detection, then review
```

## Usage

```bash
npx loccy lint             # check translations and key usage
npx loccy lint --fix       # same, and remove unused keys
npx loccy format           # sort keys in translation files
npx loccy format --check   # report unsorted files, write nothing
```

Both commands exit with code `1` when issues remain, so they can gate merges:

```yaml
# .github/workflows/i18n.yml
- run: npx loccy lint && npx loccy format --check
```

Pass `--config <path>` to point at a config outside the project root. Set `LOCCY_LINT_DEBUG=1` for debug output.

## Rules

Each rule lives on its axis in `loccy.yaml`. [Configuration docs.](https://loccy.dev/docs/config)

| Rule | What it catches |
| :--- | :--- |
| `translations.noUntranslatedKeys` | Keys missing or empty in some locales |
| `translations.sortKeys` | Unsorted translation files (`loccy format` fixes them) |
| `usages.noUnusedKeys` | Keys never referenced in code (`loccy lint --fix` removes them) |
| `usages.noUnresolvedKeys` | Keys used in code but absent from translations |

## Development

From the monorepo root run `pnpm install`, then from `apps/lint`:

```bash
pnpm dev    # rebuild on TypeScript changes
npm link    # once, makes `loccy` runnable from any test project
```

## Links

[Website](https://loccy.dev) • [GitHub](https://github.com/loccy-dev/monorepo) • [Discord](https://discord.gg/btztGrejXU)