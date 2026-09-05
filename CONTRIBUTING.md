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

To launch the extension, open the repo in VS Code and press **F5** (**Run
Extension**). It talks to the production backend.

> For manual testing, open one of `apps/extension/src/tests/test-projects/*`
> (vue-i18n, react-i18next, next-intl) as the workspace in the launched
> Extension Development Host.

> Generated files (`packages/types/schemas/*`) are produced by the build.
> Never hand-edit them.

### Installing a build in your own editor

The Extension Development Host is the fastest loop, but it is a separate window with its own workspace. To use a build in the editor you work in every day, package it as a `.vsix` and install it:

```sh
cd apps/extension
npx @vscode/vsce package --no-dependencies   # runs the production build first
code --install-extension loccy-<version>.vsix
```

Use `cursor --install-extension` (or the equivalent for your editor) in place of `code`. Any VS Code based editor accepts the same `.vsix`.

The package takes its version from `apps/extension/package.json`, which is the version already on the marketplace. An editor will not replace an installed extension with a package of the same version, so uninstall the marketplace copy first, or bump the version in `package.json` so the build is unmistakably yours. Reload the window after installing.

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
