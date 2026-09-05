import * as assert from 'assert'
import ts from 'typescript'
import { extractValuesFromNode } from '../helpers/dynamic-key-resolver/const-values'
import { findDeclarationByName } from '../helpers/dynamic-key-resolver/type-resolver'

// The common idiom: a const object and the type derived from it, sharing one name.
const ERRORS_MODULE = [
  'export const SignInError = {',
  "  InvalidEmail: 'invalidEmail',",
  "  InvalidCode: 'invalidCode',",
  "  Network: 'network',",
  '} as const',
  '',
  'export type SignInError = (typeof SignInError)[keyof typeof SignInError]',
].join('\n')

function sourceFile(source: string) {
  return ts.createSourceFile('errors.ts', source, ts.ScriptTarget.Latest, true)
}

suite('findDeclarationByName', () => {
  test('a name in type position finds the type, not the const object sharing its name', () => {
    const file = sourceFile(ERRORS_MODULE)

    const declaration = findDeclarationByName(file, 'SignInError', 'type')

    assert.ok(declaration && ts.isTypeAliasDeclaration(declaration))
    assert.deepEqual(extractValuesFromNode(declaration, file, 'values'), ['invalidEmail', 'invalidCode', 'network'])
  })

  test('a name in type position falls back to the const object when no type shares it', () => {
    const file = sourceFile("export const routes = { Home: 'home' } as const")

    const declaration = findDeclarationByName(file, 'routes', 'type')

    assert.ok(declaration && ts.isVariableDeclaration(declaration))
  })

  test('a name in value position finds the const object', () => {
    const file = sourceFile(ERRORS_MODULE)

    const declaration = findDeclarationByName(file, 'SignInError', 'value')

    assert.ok(declaration && ts.isVariableDeclaration(declaration))
  })
})
