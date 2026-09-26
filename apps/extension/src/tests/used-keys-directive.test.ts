import assert from 'assert'
import fs from 'fs'
import path from 'path'
import * as vscode from 'vscode'
import { resourceService } from '../helpers/resource-service'
import { usageService } from '../helpers/usage-service'
import { buildDecorations } from '../hover/annotations/build-decorations'

const testProjectPath = path.join(__dirname, '../../src/tests/test-projects/react-i18next')
const translationPath = 'public/locales/en/translation.json'
const fixtureUri = vscode.Uri.file(path.join(testProjectPath, 'src/unit-tests/used-keys-directive.tsx'))

function usageLocations(keypath: string) {
  const perUri = usageService.getPerKeypath().get(keypath)
  return [...(perUri?.entries() ?? [])].flatMap(([uri, infos]) => infos.map((info) => ({ uri, loc: info.loc })))
}

suite('loccy-used-keys directive', () => {
  suiteSetup(async () => {
    const content = fs.readFileSync(path.join(testProjectPath, translationPath), 'utf8')
    resourceService.setTestModule([{ relativePath: translationPath, content }], {
      globPattern: 'public/locales/**/*.json',
      layout: '{locale}/{namespace}.json',
      framework: 'react-i18next',
      defaultNs: 'translation',
    })
    await usageService.init()
  })

  suiteTeardown(async () => {
    resourceService.setTestModule([])
    await usageService.init()
  })

  test('counts as a usage of each key it covers, located at its pattern', async () => {
    await usageService.handleFileUpdate([fixtureUri])

    const content = (await vscode.workspace.openTextDocument(fixtureUri)).getText()
    const start = content.indexOf('cta.*')
    const directive = { uri: fixtureUri.toString(), loc: { start, end: start + 'cta.*'.length, line: 3 } }

    assert.deepStrictEqual(usageLocations('cta.save'), [directive])
    assert.deepStrictEqual(usageLocations('cta.cancel'), [directive])
    assert.deepStrictEqual(usageLocations('appName'), [])
  })

  test('shows its hover once when hovering the translation preview', async () => {
    const editor = await vscode.window.showTextDocument(fixtureUri)
    await usageService.handleFileUpdate([fixtureUri])

    const ranges = usageService.perFile.get(fixtureUri.toString()) ?? []
    const { inline, preview } = buildDecorations(editor, ranges, true, resourceService.primaryView())
    const hoversAt = (position: vscode.Position) =>
      [...inline, ...preview].filter((decoration) => decoration.hoverMessage && decoration.range.contains(position))

    assert.ok(preview.length)
    for (const { range } of preview) {
      assert.strictEqual(hoversAt(range.start).length, 1)
    }
  })
})
