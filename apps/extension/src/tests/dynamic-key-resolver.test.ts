import assert from 'assert'
import path from 'path'
import * as vscode from 'vscode'
import { DynamicKeyResolver } from '../helpers/dynamic-key-resolver/dynamic-key-resolver'

const fixturesPath = path.join(__dirname, '../../src/tests/test-projects/react-i18next/src/unit-tests/dynamic-keys')

async function waitForTsServer(uri: vscode.Uri, position: vscode.Position) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, position)
    const text = hovers.flatMap((h) => h.contents.map((c) => (typeof c === 'string' ? c : c.value))).join('\n')
    if (text && !text.includes('loading')) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error('TS server did not become ready')
}

type ResolveCase = { name: string; expression: string; keypaths: string[] }

async function resolveKeypaths(fileName: string, expression: string) {
  const uri = vscode.Uri.file(path.join(fixturesPath, fileName))
  const doc = await vscode.workspace.openTextDocument(uri)
  const start = doc.getText().indexOf(expression)
  assert.notStrictEqual(start, -1, `expression not found: ${expression}`)
  await waitForTsServer(uri, doc.positionAt(start - 2))

  const keypaths = await new DynamicKeyResolver(uri).resolveKey(expression, {
    start,
    end: start + expression.length,
    line: doc.positionAt(start).line,
  })
  return keypaths.sort()
}

suite('dynamic key resolver', function () {
  this.timeout(60_000)

  const cases: ResolveCase[] = [
    { name: 'const string concat', expression: "'static.' + cancel", keypaths: ['static.cancel'] },
    {
      name: 'literal union concat',
      expression: "'literal.union.' + saveOrCancel",
      keypaths: ['literal.union.cancel', 'literal.union.save'],
    },
    {
      name: 'template with suffix',
      expression: '`template.${saveOrCancel}.suffix`',
      keypaths: ['template.cancel.suffix', 'template.save.suffix'],
    },
    { name: 'inferred const from ternary', expression: '`const.${upOrDown}`', keypaths: ['const.down', 'const.up'] },
    { name: 'string enum', expression: '`enum.${direction}`', keypaths: ['enum.down', 'enum.up'] },
    {
      name: 'imported type alias via prop',
      expression: '`imported.${props.action}`',
      keypaths: ['imported.cancel', 'imported.save'],
    },
    {
      name: 'prop with inline literal union',
      expression: '`${props.prefix}.title`',
      keypaths: ['dashboard.title', 'settings.title'],
    },
    { name: 'inline ternary', expression: "`inline.${flag ? 'yes' : 'no'}`", keypaths: ['inline.no', 'inline.yes'] },
    {
      name: 'nullish fallback',
      expression: "`nullish.${maybeLabel ?? 'fallback'}`",
      keypaths: ['nullish.fallback', 'nullish.label'],
    },
    { name: 'non-null assertion', expression: '`nonNull.${maybeLabel!}`', keypaths: ['nonNull.label'] },
    {
      name: 'multiple interpolations',
      expression: '`multi.${upOrDown}.${saveOrCancel}`',
      keypaths: ['multi.down.cancel', 'multi.down.save', 'multi.up.cancel', 'multi.up.save'],
    },
    { name: 'plain string stays unresolved', expression: '`unknown.${props.anyValue}`', keypaths: [] },
  ]

  for (const { name, expression, keypaths } of cases) {
    test(name, async () => {
      assert.deepStrictEqual(await resolveKeypaths('basic.tsx', expression), keypaths)
    })
  }

  const edgeCases: ResolveCase[] = [
    { name: 'local type alias param', expression: '`alias.${size}`', keypaths: ['alias.lg', 'alias.sm'] },
    { name: 'keyof typeof object', expression: '`keyof.${labelKey}`', keypaths: ['keyof.Body', 'keyof.Title'] },
    { name: 'const object member', expression: '`member.${SignInError.Network}`', keypaths: ['member.network'] },
    { name: 'as const tuple element', expression: '`tuple.${sizes[index]}`', keypaths: ['tuple.lg', 'tuple.sm'] },
    { name: 'function return type', expression: '`call.${mode}`', keypaths: ['call.dark', 'call.light'] },
    { name: 'or fallback', expression: "`or.${maybe || 'y'}`", keypaths: ['or.x', 'or.y'] },
  ]

  for (const { name, expression, keypaths } of edgeCases) {
    test(name, async () => {
      assert.deepStrictEqual(await resolveKeypaths('edge-cases.tsx', expression), keypaths)
    })
  }

  test('const-object enum type resolves to object values, not property names', async () => {
    const keypaths = await resolveKeypaths('const-object-enum.tsx', '`signIn.errors.${error}`')

    assert.deepStrictEqual(keypaths, [
      'signIn.errors.expiredCode',
      'signIn.errors.invalidCode',
      'signIn.errors.invalidEmail',
      'signIn.errors.network',
      'signIn.errors.rateLimited',
      'signIn.errors.unknown',
    ])
  })
})
