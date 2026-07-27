import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as assert from 'assert'
import { isEqual } from 'lodash'
import { resourceService } from '../helpers/resource-service'
import { getKeyRanges } from '../editor-integration/frameworks/get-key-ranges'
import type { KeypathInfo } from '@repo/types/framework.types'
import { fillMissingData } from './test-helpers'

// FIXME: should be separate file, independent from vue-i18n project
// prettier-ignore
const vueI18nFile = fs.readFileSync(path.join(__dirname, '../../src/tests/test-projects/vue-i18n/src/unit-tests/keys.vue'), 'utf8')

suite('keyDetectionHelper', () => {
  test('plain-strings', async () => {
    const expectedRanges: KeypathInfo[] = fillMissingData(
      [
        {
          loc: { start: 7157, end: 7171 },
          content: "'existing.key'",
          keypaths: ['existing.key'],
          type: 'static',
        },
      ],
      vueI18nFile,
    )

    resourceService.setTestModule([{ relativePath: 'en.json', content: '{"existing":{"key":"hi"}}' }], {
      layout: '{locale}.json',
      globPattern: '*.json',
    })

    const uri = vscode.Uri.file('src/tests/test-projects/vue-i18n/src/unit-tests/keys.vue')
    const ranges = await getKeyRanges(vueI18nFile, uri)

    resourceService.setTestModule([])

    for (const expected of expectedRanges) {
      const found = ranges.some((range) => isEqual(range, expected))
      if (!found) {
        console.log(JSON.stringify(ranges, null, 2))
      }

      assert.ok(found, `Expected range not found: ${JSON.stringify(expected)}`)
    }
  })

  test('multiple-files-same-locale', async () => {
    const expectedRanges: KeypathInfo[] = fillMissingData(
      [
        {
          loc: { start: 7157, end: 7171 },
          content: "'existing.key'",
          keypaths: ['existing.key'],
          type: 'static',
        },
        {
          loc: { start: 705, end: 726 },
          content: "'accessibility.label'",
          keypaths: ['accessibility.label'],
          type: 'static',
        },
      ],
      vueI18nFile,
    )

    // keypath detection only needs the keys present, not full translations
    resourceService.setTestModule(
      [
        { relativePath: 'en.json', content: '{"existing":{"key":"hi"}}' },
        { relativePath: 'de.json', content: '{"accessibility":{"label":"hey"}}' },
      ],
      { layout: '{locale}.json', globPattern: '*.json' },
    )

    const uri = vscode.Uri.file('src/tests/test-projects/vue-i18n/src/unit-tests/keys.vue')
    const ranges = await getKeyRanges(vueI18nFile, uri)

    resourceService.setTestModule([])

    for (const expected of expectedRanges) {
      const found = ranges.some((range) => isEqual(range, expected))
      if (!found) {
        console.log(JSON.stringify(ranges, null, 2))
      }

      assert.ok(found, `Expected range not found: ${JSON.stringify(expected)}`)
    }
  })

  // NOTE: dynamic key resolution tests omitted - hard to make them work since they use vscode's built-in API
})
