import assert from 'assert'
import { test } from 'mocha'
import { staticKeypathPattern } from '@repo/shared/core/usages/key-detection/regexps-common'

// duplicate capture groups fail on Node.js <= 20.9
// this test is minimal because regexps used in other tests anyway

suite('duplicate capture groups (Node.js compat)', function () {
  test('staticKeypathPattern should not throw on creation', () => {
    assert.ok(staticKeypathPattern)
  })
})
