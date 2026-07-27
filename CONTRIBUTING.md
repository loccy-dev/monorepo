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
