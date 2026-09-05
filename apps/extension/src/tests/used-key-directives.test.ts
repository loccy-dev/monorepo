import * as assert from 'assert'
import { collectUsedKeyDirectives } from '@repo/shared/core/usages/used-key-directives'
import { usageService } from '../helpers/usage-service'

const JSX_COMMENT = '{/* loccy-used-keys: signIn.errors.* */}\nconst label = t(`signIn.errors.${error}`)'
const LINE_COMMENT = '// loccy-used-keys: status\nconst key = `status`'

suite('usedKeyDirectives in the editor', () => {
  teardown(() => {
    usageService.perFileDirectives = new Map()
  })

  const declare = (file: string, content: string) => {
    usageService.perFileDirectives.set(file, collectUsedKeyDirectives(content))
  }

  test('a JSX-comment directive declares its keypaths used', () => {
    declare('file:///SignIn.tsx', JSX_COMMENT)

    assert.equal(usageService.isDeclaredUsed('signIn.errors.invalidEmail'), true)
    assert.equal(usageService.isDeclaredUsed('signIn.errors.unknown'), true)
  })

  test('a line-comment directive declares its keypath used', () => {
    declare('file:///status.ts', LINE_COMMENT)

    assert.equal(usageService.isDeclaredUsed('status'), true)
  })

  test('a keypath no directive pattern matches is not declared used', () => {
    declare('file:///SignIn.tsx', JSX_COMMENT)
    declare('file:///status.ts', LINE_COMMENT)

    assert.equal(usageService.isDeclaredUsed('signIn.title'), false)
    assert.equal(usageService.isDeclaredUsed('statusBar'), false)
  })

  test('directives pool across files, and none declares anything', () => {
    assert.equal(usageService.isDeclaredUsed('signIn.errors.invalidEmail'), false)

    declare('file:///SignIn.tsx', JSX_COMMENT)
    declare('file:///status.ts', LINE_COMMENT)

    assert.equal(usageService.isDeclaredUsed('signIn.errors.invalidEmail'), true)
    assert.equal(usageService.isDeclaredUsed('status'), true)
  })
})
