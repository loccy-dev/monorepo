import fs from 'fs'
import assert from 'assert'
import path from 'path'
import * as vscode from 'vscode'
import { cloneDeep } from 'lodash'
import { getKeyRanges } from '../../editor-integration/frameworks/get-key-ranges'
import { cfg } from '../../global-config'
import type { KeypathInfo } from '@repo/types/framework.types'
import { fillMissingData } from '../test-helpers'
import { test } from 'mocha'
import { resourceService } from '../../helpers/resource-service'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'

const testProjectPath = path.join(__dirname, '../../../src/tests/test-projects/next-intl')
const codePath = 'src/unit-tests'
const translationFilePath = 'messages'

const localeResources = {
  en: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'en.json'), 'utf8'),
  de: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'de.json'), 'utf8'),
  ru: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'ru.json'), 'utf8'),
}

const nextIntlFiles = {
  main: fs.readFileSync(path.join(testProjectPath, codePath, 'main.tsx'), 'utf8'),
  withPrefix: fs.readFileSync(path.join(testProjectPath, codePath, 'with-prefix.tsx'), 'utf8'),
  serverComponent: fs.readFileSync(path.join(testProjectPath, codePath, 'server-component.tsx'), 'utf8'),
}

suite('next-intl project', function () {
  const defaultConfig = cloneDeep(cfg.settings)
  const defaultResolvedConfig = cfg.resolvedConfig
  const defaultNextIntlNs = NS_WITHOUT_NS

  function setLocales(locales?: string[]) {
    if (locales && locales.length) {
      resourceService.setTestModule(
        locales.map((locale) => ({
          relativePath: `src/i18n/${locale}.json`,
          content: localeResources[locale as keyof typeof localeResources],
        })),
        {
          globPattern: 'src/i18n/*.json',
          layout: '{locale}.json',
          framework: 'next-intl',
          defaultNs: NS_WITHOUT_NS,
          sortKeys: true,
        },
      )
    } else {
      resourceService.setTestModule([])
    }
  }

  suiteSetup(async () => {
    cfg.resolvedConfig = {
      modules: {
        default: {
          name: 'default',
          framework: 'next-intl',
          translations: { messageFormat: 'icu', glob: '**/*.json', layout: '{locale}.json' },
          usages: { include: ['**/*'] },
        },
      },
    }
    setLocales(['en', 'de', 'ru'])
  })

  suiteTeardown(async () => {
    cfg.settings = defaultConfig
    cfg.resolvedConfig = defaultResolvedConfig
    setLocales()
  })

  suite('keypath detection', async () => {
    test('main', async () => {
      const content = nextIntlFiles.main
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 166, end: 181 }, content: "'state.initial'", keypaths: ['state.initial'] },
          { loc: { start: 202, end: 214 }, content: "'simple.key'", keypaths: ['simple.key'] },
          { loc: { start: 235, end: 250 }, content: '"double.quoted"', keypaths: ['double.quoted'] },
          { loc: { start: 273, end: 291 }, content: '`template.literal`', keypaths: ['template.literal'] },
          { loc: { start: 334, end: 347 }, content: "'with.params'", keypaths: ['with.params'] },
          { loc: { start: 434, end: 444 }, content: 'dynamicKey', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 467, end: 496 }, content: '`prefix.${dynamicKey}.suffix`', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 528, end: 539 }, content: "'jsx.title'", keypaths: ['jsx.title'] },
          { loc: { start: 565, end: 580 }, content: "'jsx.attribute'", keypaths: ['jsx.attribute'] },
          { loc: { start: 586, end: 599 }, content: "'jsx.content'", keypaths: ['jsx.content'] },
          { loc: { start: 624, end: 638 }, content: "'jsx.template'", keypaths: ['jsx.template'] },
          { loc: { start: 692, end: 705 }, content: "'jsx.onclick'", keypaths: ['jsx.onclick'] },
          // custom t-func name
          { loc: { start: 875, end: 887 }, content: "'custom.one'", keypaths: ['custom.one'] },
          { loc: { start: 919, end: 931 }, content: '"custom.two"', keypaths: ['custom.two'] },
          { loc: { start: 961, end: 973 }, content: "'custom.jsx'", keypaths: ['custom.jsx'] },
        ],
        content,
        { ns: defaultNextIntlNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/main.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('with prefix', async () => {
      const content = nextIntlFiles.withPrefix
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 158, end: 165 }, content: "'title'", keypaths: ['dashboard.title'], prefix: 'dashboard' },
          { loc: { start: 188, end: 198 }, content: "'subtitle'", keypaths: ['dashboard.subtitle'], prefix: 'dashboard' },
        ],
        content,
        { ns: defaultNextIntlNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/with-prefix.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('server component', async () => {
      const content = nextIntlFiles.serverComponent
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 149, end: 163 }, content: "'server.title'", keypaths: ['server.title'] },
          { loc: { start: 308, end: 318 }, content: "'subtitle'", keypaths: ['dashboard.subtitle'], prefix: 'dashboard' },
        ],
        content,
        { ns: defaultNextIntlNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/server-component.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })
  })
})
