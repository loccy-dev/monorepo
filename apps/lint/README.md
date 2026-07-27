# Loccy i18n linter for React & Vue

I18n linter for React & Vue apps. Finds unused keys, missing or empty translations, keys referenced in code but absent from translations, and unsorted translation files, locally and in CI.

Part of [Loccy](https://loccy.dev), open-source i18n devtooling. Reads the same `loccy.yaml` as the [Loccy IDE extension](https://marketplace.visualstudio.com/items?itemName=loccy.loccy). Configure once, use everywhere.

## Installation

```bash
npm i -D @loccy-dev/lint
```

Requires Node.js >= 18.

## Set up

Loccy needs a `loccy.yaml` (run once, then commit it).

**Fastest, let your AI agent do it:**

```bash
npx loccy init-prompt | pbcopy
```

Then paste into your coding agent.

**Or do it yourself:**

```bash
npx loccy init    # scaffold loccy.yaml from auto-detection, then review it
```

## Usage

```bash
# lint translations and key usage
npx loccy lint

# remove unused keys
npx loccy lint --fix

# sort keys in translation files (modules with sortKeys)
npx loccy format

# check sort order without writing, exit 1 if any file needs sorting (for CI)
npx loccy format --check
```

`loccy lint` needs a committed `loccy.yaml` (run `npx loccy init` once to create it). It exits with code `1` when issues remain, so it can gate merges in CI:

```yaml
# .github/workflows/i18n.yml
- run: npx loccy lint && npx loccy format --check
```

### What lint checks

- **Missing translations**: keys missing or empty in some locales
- **Usage**: keys unused in code (`--fix` removes them) and keys used in code but missing from translations

Sorting is separate: run `npx loccy format` to sort keys (for modules with `sortKeys`). Rules are configured on their axis in `loccy.yaml`: `translations.noUntranslatedKeys`, `translations.sortKeys`, `usages.noUnusedKeys`, `usages.noUnresolvedKeys`. See the [configuration docs](https://loccy.dev/docs/config).

Set `LOCCY_LINT_DEBUG=1` for debug output.

## Development

From the monorepo root: `pnpm install`, then from `apps/lint`:

```bash
pnpm dev    # rebuilds on TypeScript changes
npm link    # once, makes `loccy` runnable from any test project
```
