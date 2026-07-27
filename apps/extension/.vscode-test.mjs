import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'out/tests/**/*.test.js',
  version: '1.90.0', // node 20.9, more problematic, catches more edge-cases like duplicate capture groups in regex

  mocha: {
    reporter: 'spec',
    reporterOptions: {
      maxDiffSize: 0, // 0 means unlimited, or set a specific number like 50000
    },
  },
})
