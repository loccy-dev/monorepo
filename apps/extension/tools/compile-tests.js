#!/usr/bin/env node

// Bundle each test file to CJS for the vscode-test (mocha) runner.
// tsc can't emit CJS anymore: src typechecks as ESM (moduleResolution bundler)
// to consume @repo/* workspace packages, so esbuild does the emitting here —
// same as the extension bundle itself.

const esbuild = require('esbuild')
const fs = require('fs')
const { globSync } = require('glob')
const externals = require('./esbuild-externals')

const outdir = 'out/tests'
const entryPoints = globSync('src/tests/**/*.test.ts', { ignore: 'src/tests/test-projects/**' })

// esbuild only writes/overwrites current entry points — it never removes stale output from a
// source file that's since been deleted/renamed. Left uncleaned, mocha picks up the orphaned
// compiled test and fails on missing fixtures instead of just not finding the test.
fs.rmSync(outdir, { recursive: true, force: true })

esbuild
  .build({
    entryPoints,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outdir,
    outbase: 'src/tests',
    sourcemap: true,
    external: [...externals, 'mocha'],
  })
  .catch(() => process.exit(1))
