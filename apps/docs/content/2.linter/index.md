---
title: Get started
navigation:
  title: Get started
description: "Install the Loccy linter and set up loccy.yaml — free, offline, for React & Vue."
---

# Get started

A free, offline command-line linter that catches i18n problems before they merge: unused keys, missing translations, and unsorted translation files. Run it locally or wire it into CI to fail the build when locales drift.

It reads the same [`loccy.yaml`](/docs/config) as the [extension](/docs/extension): configure once, use everywhere.

## Install

Requirements: Node.js 18 or later.

```bash
npm i -D @loccy-dev/lint
```

## Set up loccy.yaml

Loccy needs a `loccy.yaml` in your repo root: commit it once, then the linter and the IDE extension both read it.

**Fastest: let your coding agent do it.** This prints a step-by-step setup prompt: it has your agent run `init`, read the `lint` output, and resolve false positives (dynamic keys, deliberately incomplete locales) on its own:

```bash
npx loccy init-prompt | pbcopy
```

Then paste into your coding agent.

**Or do it yourself:**

```bash
npx loccy init
```

## Lint

```bash
npx loccy lint
```

See [Command reference](/docs/linter/commands) for every command, flag, and exit code.
