import * as assert from 'assert'
import { toPlaceholders } from '../api/ai-client'

suite('toPlaceholders', () => {
  test('returns undefined when there are no params', () => {
    assert.strictEqual(toPlaceholders({}), undefined)
  })

  test('passes the params object through when non-empty', () => {
    const params = { userName: 'user.name', count: 'items.length' }
    assert.strictEqual(toPlaceholders(params), params)
  })
})
