import * as assert from 'assert'
import { isLocaleLike } from '@repo/shared/core/helpers/locale.helpers'

suite('Helpers', () => {
  test('isLocaleLike', () => {
    assert.strictEqual(isLocaleLike('en'), true)
    assert.strictEqual(isLocaleLike('en-US'), true)
    assert.strictEqual(isLocaleLike('es_MX'), true)
    assert.strictEqual(isLocaleLike('zh-Hant-TW'), true)
    assert.strictEqual(isLocaleLike('fr_CA'), true)
    assert.strictEqual(isLocaleLike('de-DE'), true)
    assert.strictEqual(isLocaleLike('invalid-locale-code'), false)
    assert.strictEqual(isLocaleLike(''), false)
    assert.strictEqual(isLocaleLike('a'), false)
    assert.strictEqual(isLocaleLike('this-is-a-very-long-locale-code'), false)
    assert.strictEqual(isLocaleLike('common'), false)
    assert.strictEqual(isLocaleLike('home'), false)
    assert.strictEqual(isLocaleLike('main'), false)
    assert.strictEqual(isLocaleLike('general'), false)

    // possibility to improve - make it pass
    // assert.strictEqual(isLocaleLike('xx-YY'), false)
  })
})
