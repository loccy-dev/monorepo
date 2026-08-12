import * as assert from 'assert'
import { parseTranslationsInput } from '../hover/edit-as-json-cmd'

suite('editAsJson', () => {
  test('empty input resolves to an empty object', () => {
    assert.deepStrictEqual(parseTranslationsInput(''), {})
    assert.deepStrictEqual(parseTranslationsInput('  \n\n  '), {})
  })

  test('header comment only resolves to an empty object', () => {
    assert.deepStrictEqual(parseTranslationsInput('// Virtual file: Edit, then press Cmd+S\n\n'), {})
  })

  test('JSON5 input', () => {
    assert.deepStrictEqual(parseTranslationsInput('// header\n{\n  en: \'a\',\n  de: "b",\n}'), {
      en: 'a',
      de: 'b',
    })
  })

  test('malformed input throws', () => {
    assert.throws(() => parseTranslationsInput('{"en":}'))
  })

  test('non-object input throws', () => {
    assert.throws(() => parseTranslationsInput('["en"]'))
    assert.throws(() => parseTranslationsInput('"en"'))
  })
})
