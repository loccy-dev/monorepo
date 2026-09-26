# Contributing

Thanks for your interest in improving Loccy!

## Prerequisites

- Node.js >= 22
- pnpm 9

## Setup

```sh
pnpm install
```

> `apps/web` is a private app, gitignored and not in this repo. `pnpm install` picks it up and may modify `pnpm-lock.yaml`. Expected: commit it if you changed deps; maintainer resolves it on merge.

## Layout

- `apps/extension`: VS Code extension (the published product)
- `apps/lint`: i18n linter + config initializer
- `packages/shared`: shared logic (browser + node)
- `packages/node-platform`: node-specific platform bindings
- `packages/types`: shared types and config schemas

## Develop

Run the full build/watch across the monorepo:

```sh
turbo dev
```

> Generated files (`packages/types/schemas/*`) are produced by the build.
> Never hand-edit them.

### Try your changes

Either way, the extension talks to the production backend.

**Live, via F5.** Open the repo in your editor and press **F5** (**Run
Extension**). A separate window (Extension Development Host) opens with your
build loaded. Open one of `apps/extension/src/tests/test-projects/*`
(vue-i18n, react-i18next, next-intl) as its workspace. Fastest loop.

**Packaged, as a `.vsix`.** To try a build on your own projects in a regular
editor window:

```sh
cd apps/extension
npx @vscode/vsce package --no-dependencies
code --install-extension loccy-<version>.vsix
```

Use your editor's CLI in place of `code`, then reload the window.

## Current focus

See [`TODO.md`](TODO.md) for current priorities. Contributions welcome.

## Before you open a PR

Format, lint, typecheck and test everything from the repo root:

```sh
turbo flt
```

## Pull requests

- Keep changes focused; one concern per PR.
- Match existing code style.
- Ensure `turbo flt` passes.
