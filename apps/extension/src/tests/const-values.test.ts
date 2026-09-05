import * as assert from 'assert'
import ts from 'typescript'
import { extractValuesFromNode, findNodeAtPosition } from '../helpers/dynamic-key-resolver/const-values'

const SIGN_IN_ERROR = [
  'export const SignInError = {',
  "  InvalidEmail: 'invalidEmail',",
  "  InvalidCode: 'invalidCode',",
  "  Network: 'network',",
  '} as const',
].join('\n')

/** The keypath candidates a dynamic key resolves to when it lands on `declarationName`. */
function valuesFor(source: string, declarationName: string): string[] {
  const sourceFile = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true)
  const node = findNodeAtPosition(sourceFile, source.indexOf(declarationName))
  assert.ok(node, `no node at the declaration of ${declarationName}`)
  return extractValuesFromNode(node, sourceFile)
}

suite('constValues', () => {
  test('a value-union type resolves to the property values, not the property names', () => {
    const source = `${SIGN_IN_ERROR}\n\nexport type SignInError = (typeof SignInError)[keyof typeof SignInError]`

    assert.deepEqual(valuesFor(source, 'type SignInError'), ['invalidEmail', 'invalidCode', 'network'])
  })

  test('an unparenthesised value-union type resolves to the property values', () => {
    const source = `${SIGN_IN_ERROR}\n\nexport type SignInError = typeof SignInError[keyof typeof SignInError]`

    assert.deepEqual(valuesFor(source, 'type SignInError'), ['invalidEmail', 'invalidCode', 'network'])
  })

  test('a `keyof typeof` type resolves to the property names', () => {
    const source = `${SIGN_IN_ERROR}\n\nexport type SignInErrorKey = keyof typeof SignInError`

    assert.deepEqual(valuesFor(source, 'type SignInErrorKey'), ['InvalidEmail', 'InvalidCode', 'Network'])
  })

  test('an object reached without a type offers both values and names', () => {
    assert.deepEqual(valuesFor(SIGN_IN_ERROR, 'SignInError'), [
      'invalidEmail',
      'InvalidEmail',
      'invalidCode',
      'InvalidCode',
      'network',
      'Network',
    ])
  })

  test('a property whose value is not a string literal offers only its name', () => {
    const source = 'const sizes = { small: 1, large: 2 }'

    assert.deepEqual(valuesFor(source, 'sizes'), ['small', 'large'])
  })

  test('a string enum offers its member initializers and names', () => {
    const source = "enum SignInError { InvalidCode = 'invalidCode', Network = 'network' }"

    assert.deepEqual(valuesFor(source, 'SignInError'), ['invalidCode', 'InvalidCode', 'network', 'Network'])
  })

  test('a union of string literal types resolves to the literals', () => {
    const source = "type SignInError = 'invalidCode' | 'network'"

    assert.deepEqual(valuesFor(source, 'SignInError'), ['invalidCode', 'network'])
  })

  test('a string variable resolves to its value', () => {
    const source = "const key = 'invalidCode'"

    assert.deepEqual(valuesFor(source, 'key'), ['invalidCode'])
  })
})
