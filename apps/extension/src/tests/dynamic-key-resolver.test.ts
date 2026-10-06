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

  const cta = ['cta.cancel', 'cta.save']
  const directions = ['direction.down', 'direction.up']
  const pageTitles = ['page.dashboard.title', 'page.settings.title']

  const cases: ResolveCase[] = [
    { name: 'const string concat', expression: "'cta.' + cancel", keypaths: ['cta.cancel'] },
    { name: 'literal union concat', expression: "'cta.' + saveOrCancel", keypaths: cta },
    { name: 'template with suffix', expression: '`page.${page}.title`', keypaths: pageTitles },
    { name: 'inferred const from ternary', expression: '`direction.${upOrDown}`', keypaths: directions },
    { name: 'string enum', expression: '`direction.${direction}`', keypaths: directions },
    { name: 'imported type alias via prop', expression: '`cta.${props.action}`', keypaths: cta },
    { name: 'prop with inline literal union', expression: '`${props.section}.title`', keypaths: pageTitles },
    { name: 'inline ternary', expression: "`cta.${flag ? 'save' : 'cancel'}`", keypaths: cta },
    { name: 'nullish fallback', expression: "`cta.${maybeSave ?? 'cancel'}`", keypaths: cta },
    { name: 'non-null assertion', expression: '`cta.${maybeSave!}`', keypaths: ['cta.save'] },
    {
      name: 'multiple interpolations',
      expression: '`page.${page}.${field}`',
      keypaths: ['page.dashboard.subtitle', 'page.dashboard.title', 'page.settings.subtitle', 'page.settings.title'],
    },
    { name: 'plain string stays unresolved', expression: '`cta.${props.anyValue}`', keypaths: [] },
  ]

  for (const { name, expression, keypaths } of cases) {
    test(name, async () => {
      assert.deepStrictEqual(await resolveKeypaths('basic.tsx', expression), keypaths)
    })
  }

  const edgeCases: ResolveCase[] = [
    { name: 'local type alias param', expression: '`direction.${direction}`', keypaths: directions },
    { name: 'keyof typeof object', expression: '`cta.${labelKey}`', keypaths: cta },
    { name: 'const object member', expression: '`cta.${Action.Cancel}`', keypaths: ['cta.cancel'] },
    { name: 'as const tuple element', expression: '`direction.${directions[index]}`', keypaths: directions },
    { name: 'function return type', expression: '`direction.${returned}`', keypaths: directions },
    { name: 'or fallback', expression: "`direction.${maybeUp || 'down'}`", keypaths: directions },
    { name: 'imported keyof typeof alias', expression: '`page.${page}.title`', keypaths: pageTitles },
    { name: 'renamed type export', expression: '`direction.${movement}`', keypaths: directions },
    { name: 'unparenthesized typeof indexed by keyof', expression: '`cta.${actionValue}`', keypaths: cta },
    { name: 'numeric enum', expression: '`level.${level}`', keypaths: ['level.0', 'level.1'] },
    { name: 'numeric enum with explicit start', expression: '`level.${priority}`', keypaths: ['level.1', 'level.2'] },
  ]

  for (const { name, expression, keypaths } of edgeCases) {
    test(name, async () => {
      assert.deepStrictEqual(await resolveKeypaths('edge-cases.tsx', expression), keypaths)
    })
  }

  const elementAccessCases: ResolveCase[] = [
    {
      name: 'record with widened values resolves to initializer values, not keys',
      expression: 'STATUS_KEY[status]',
      keypaths: ['status.queued', 'status.ready'],
    },
    { name: 'object without as const', expression: 'widened[direction]', keypaths: directions },
    { name: 'quoted property names are not values', expression: 'events[event]', keypaths: cta },
    {
      name: 'large const object resolves every value',
      expression: 'large[entry]',
      keypaths: [
        'eighth',
        'eleventh',
        'fifth',
        'first',
        'fourth',
        'ninth',
        'second',
        'seventh',
        'sixth',
        'tenth',
        'third',
        'twelfth',
      ].map((entry) => `section.entry.${entry}`),
    },
    { name: 'imported const object', expression: '`cta.${Action[action]}`', keypaths: cta },
    { name: 'record with literal values on a property', expression: 'props.pages[page]', keypaths: pageTitles },
    { name: 'record of plain strings stays unresolved', expression: 'untyped[page]', keypaths: [] },
    { name: 'array without as const', expression: 'list[index]', keypaths: directions },
  ]

  for (const { name, expression, keypaths } of elementAccessCases) {
    test(name, async () => {
      assert.deepStrictEqual(await resolveKeypaths('element-access.tsx', expression), keypaths)
    })
  }

  test('const-object enum type resolves to object values, not property names', async () => {
    assert.deepStrictEqual(await resolveKeypaths('const-object-enum.tsx', '`cta.${action}`'), cta)
  })

  test('type reference resolves to the type, not a same-named const', async () => {
    assert.deepStrictEqual(await resolveKeypaths('same-name-const-and-type.tsx', '`cta.${choice}`'), cta)
  })
})
