import fs from 'fs'
import assert from 'assert'
import path from 'path'
import * as vscode from 'vscode'
import { cloneDeep, isEqualWith } from 'lodash'
import { getKeyRanges } from '../../editor-integration/frameworks/get-key-ranges'
import { resolveMessageReferences } from '../../editor-integration/frameworks/resolve-message-references'
import { cfg } from '../../global-config'
import type { KeypathInfo } from '@repo/types/framework.types'
import { fillMissingData, openUntitledDoc, TEST_KEY_NAME, testInsertion } from '../test-helpers'
import { test } from 'mocha'
import { resourceService } from '../../helpers/resource-service'

const testProjectPath = path.join(__dirname, '../../../src/tests/test-projects/react-i18next')
const codePath = 'src/unit-tests'
const translationFilePath = 'public/locales'

const localeResources = {
  en: {
    translation: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'en/translation.json'), 'utf8'),
    dashboard: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'en/dashboard.json'), 'utf8'),
  },
  de: {
    translation: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'de/translation.json'), 'utf8'),
    dashboard: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'de/dashboard.json'), 'utf8'),
  },
  ru: {
    translation: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'ru/translation.json'), 'utf8'),
    dashboard: fs.readFileSync(path.join(testProjectPath, translationFilePath, 'ru/dashboard.json'), 'utf8'),
  },
}

const reactI18nextFiles = {
  main: fs.readFileSync(path.join(testProjectPath, codePath, 'main.tsx'), 'utf8'),
  classComponent: fs.readFileSync(path.join(testProjectPath, codePath, 'class-component.tsx'), 'utf8'),
  customDefaultNs: fs.readFileSync(path.join(testProjectPath, codePath, 'custom-default-ns.tsx'), 'utf8'),
  hocWithNsArray: fs.readFileSync(path.join(testProjectPath, codePath, 'hoc-with-ns-array.tsx'), 'utf8'),
  hocWithNs: fs.readFileSync(path.join(testProjectPath, codePath, 'hoc-with-ns.tsx'), 'utf8'),
  nsArray: fs.readFileSync(path.join(testProjectPath, codePath, 'ns-array.tsx'), 'utf8'),
  translationRender: fs.readFileSync(path.join(testProjectPath, codePath, 'translation-render.tsx'), 'utf8'),
  withDefaultPrefix: fs.readFileSync(path.join(testProjectPath, codePath, 'with-default-prefix.tsx'), 'utf8'),
  allContexts: fs.readFileSync(path.join(testProjectPath, codePath, 'all-contexts.tsx'), 'utf8'),
  plurals: fs.readFileSync(path.join(testProjectPath, codePath, 'plurals.tsx'), 'utf8'),
}

suite('react-i18next project', function () {
  const defaultConfig = cloneDeep(cfg.settings)
  const defaultResolvedConfig = cfg.resolvedConfig
  const defaultReactI18nextNs = 'translation'

  function setLocales(locales?: string[]) {
    if (locales && locales.length) {
      const files: { relativePath: string; content: string }[] = []
      for (const locale of locales) {
        const namespaces = localeResources[locale as keyof typeof localeResources]
        for (const [ns, content] of Object.entries(namespaces)) {
          files.push({ relativePath: `public/locales/${locale}/${ns}.json`, content })
        }
      }
      resourceService.setTestModule(files, {
        globPattern: 'public/locales/**/*.json',
        layout: '{locale}/{namespace}.json',
        framework: 'react-i18next',
        defaultNs: defaultReactI18nextNs,
        sortKeys: true,
      })
    } else {
      resourceService.setTestModule([])
    }
  }

  suiteSetup(async () => {
    cfg.resolvedConfig = {
      modules: {
        default: {
          name: 'default',
          framework: 'react-i18next',
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
      const content = reactI18nextFiles.main
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 370, end: 385 }, content: "'state.initial'", keypaths: ['state.initial'] },
          { loc: { start: 428, end: 440 }, content: "'simple.key'", keypaths: ['simple.key'] },
          { loc: { start: 468, end: 483 }, content: '"double.quoted"', keypaths: ['double.quoted'] },
          { loc: { start: 514, end: 532 }, content: '`template.literal`', keypaths: ['template.literal'] },
          { loc: { start: 582, end: 595 }, content: "'with.object'", keypaths: ['with.object'] },
          { loc: { start: 699, end: 713 }, content: "'with.default'", keypaths: ['with.default'] },
          { loc: { start: 756, end: 770 }, content: "'with.options'", ns: 'custom', keypaths: ['with.options'] },
          { loc: { start: 913,  end: 926 }, content: "'primary.key'", keypaths: ['primary.key'] },
          { loc: { start: 1011, end: 1036 }, content: "'special-chars.with-dash'", keypaths: ['special-chars.with-dash'] },
          { loc: { start: 1062, end: 1082 }, content: "'special_underscore'", keypaths: ['special_underscore'] },
          { loc: { start: 1105, end: 1122 }, content: "'key.123.numbers'", keypaths: ['key.123.numbers'] },
          { loc: { start: 1198, end: 1208 }, content: 'dynamicKey', keypaths: [], ns: 'translation', type: 'dynamic-undefined' },
          { loc: { start: 1239, end: 1268 }, content: '`prefix.${dynamicKey}.suffix`', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 1297, end: 1319 }, content: "'prefix.' + dynamicKey", keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 1373, end: 1383 }, content: "'t.common'", keypaths: ['t.common'], ns: 'common' },
          { loc: { start: 1409, end: 1421 }, content: "'custom.ns1'", keypaths: ['custom.ns1'], ns: 'ns1' },
          { loc: { start: 1447, end: 1459 }, content: "'custom.ns2'", keypaths: ['custom.ns2'], ns: 'ns2' },
          { loc: { start: 1539, end: 1543 }, content: "'  '", keypaths: ['  '] },
          { loc: { start: 1566, end: 1584 }, content: "'unicode.😀.emoji'", keypaths: ['unicode.😀.emoji'] },
          { loc: { start: 1607, end: 1622 }, content: "'escaped\\\\.dot'", keypaths: ['escaped\\\\.dot'] },
          { loc: { start: 1680, end: 1694 }, content: "'effect.mount'", keypaths: ['effect.mount'] },
          { loc: { start: 1729, end: 1745 }, content: "'effect.cleanup'", keypaths: ['effect.cleanup'] },
          { loc: { start: 1798, end: 1810 }, content: "'memo.value'", keypaths: ['memo.value'] },
          { loc: { start: 1887, end: 1905 }, content: "'callback.message'", keypaths: ['callback.message'] },
          { loc: { start: 1967, end: 1978 }, content: "'jsx.title'", keypaths: ['jsx.title'] },
          { loc: { start: 2004, end: 2019 }, content: "'jsx.attribute'", keypaths: ['jsx.attribute'] },
          { loc: { start: 2025, end: 2038 }, content: "'jsx.content'", keypaths: ['jsx.content'] },
          { loc: { start: 2106, end: 2120 }, content: "'jsx.template'", keypaths: ['jsx.template'] },
          { loc: { start: 2165, end: 2177 }, content: "'jsx.concat'", keypaths: ['jsx.concat'] },
          { loc: { start: 2221, end: 2239 }, content: "'jsx.ternary.true'", keypaths: ['jsx.ternary.true'] },
          { loc: { start: 2245, end: 2264 }, content: "'jsx.ternary.false'", keypaths: ['jsx.ternary.false'] },
          { loc: { start: 2322, end: 2330 }, content: "'parent'", keypaths: ['parent'] },
          { loc: { start: 2343, end: 2350 }, content: "'param'", keypaths: ['param'] },
          { loc: { start: 2439, end: 2452 }, content: "'jsx.onclick'", keypaths: ['jsx.onclick'] },
          { loc: { start: 2509, end: 2523 }, content: "'jsx.onchange'", keypaths: ['jsx.onchange'] },
          { loc: { start: 2629, end: 2646 }, content: '`jsx.map.${item}`', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 2734, end: 2748 }, content: '"trans.simple"', keypaths: ['trans.simple'] },
          { loc: { start: 2791, end: 2814 }, content: '"trans.with.components"', keypaths: ['trans.with.components'] },
          { loc: { start: 2916, end: 2947 }, content: "{'trans.dynamic.' + dynamicKey}", keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 2981, end: 3012 }, content: '{`trans.dynamic.${dynamicKey}`}', keypaths: [], type: 'dynamic-undefined', ns: 'ns1' },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/main.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('class component', async () => {
      const content = reactI18nextFiles.classComponent
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 210, end: 223 }, content: "'class.mount'", keypaths: ['class.mount'] },
          { loc: { start: 314, end: 327 }, content: "'class.title'", keypaths: ['class.title'] },
          { loc: { start: 349, end: 368 }, content: "'class.with.params'", keypaths: ['class.with.params'] },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/class-component.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('custom default ns', async () => {
      const content = reactI18nextFiles.customDefaultNs
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 294, end: 305 }, content: "'basic.key'", keypaths: ['basic.key'] },
          { loc: { start: 331, end: 345 }, content: `"with.context"`, keypaths: ['with.context_male'] },
          { loc: { start: 400, end: 414 }, content: "`handle.click`", keypaths: ['handle.click'] },
          { loc: { start: 454, end: 472 }, content: "'namespaced.title'", keypaths: ['namespaced.title'] },
        ],
        content,
        { ns: 'namespace' },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/custom-default-ns.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('ns array', async () => {
      const content = reactI18nextFiles.nsArray
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 307, end: 358 }, content: "'very.long.key.that.continues.for.testing.purposes'", keypaths: ['very.long.key.that.continues.for.testing.purposes'] },
          { loc: { start: 421, end: 446 }, content: "'ns1:first.namespace.key'", keypaths: ['first.namespace.key'], ns: 'ns1' },
          { loc: { start: 469, end: 491 }, content: "'second.namespace.key'", keypaths: ['second.namespace.key'], ns: 'ns2' },
          { loc: { start: 544, end: 557 }, content: "'multi.title'", keypaths: ['multi.title'] },
          { loc: { start: 577, end: 593 }, content: "'multi.subtitle'", keypaths: ['multi.subtitle'], ns: 'ns2' },
        ],
        content,
        { ns: 'ns1' },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/ns-array.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('hoc with ns', async () => {
      const content = reactI18nextFiles.hocWithNs
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 255, end: 275 }, content: "'hoc.namespaced.key'", keypaths: ['hoc.namespaced.key'], ns: 'specific' },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/hoc-with-ns.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('hoc with ns array', async () => {
      const content = reactI18nextFiles.hocWithNsArray
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 300, end: 311 }, content: "'hoc.first'", keypaths: ['hoc.first'], ns: 'ns1' },
          { loc: { start: 347, end: 359 }, content: "'hoc.second'", keypaths: ['hoc.second'], ns: 'ns2' },
          { loc: { start: 392, end: 406 }, content: "'hoc.fallback'", keypaths: ['hoc.fallback'], ns: 'ns1' },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/hoc-with-ns-array.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('translation render', async () => {
      const content = reactI18nextFiles.translationRender
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 311, end: 339 }, content: "'translation.render.default'", keypaths: ['translation.render.default'] },
          { loc: { start: 431, end: 458 }, content: "'translation.render.custom'", keypaths: ['translation.render.custom'], ns: 'custom' },
          { loc: { start: 576, end: 602 }, content: "'translation.render.multi'", keypaths: ['translation.render.multi'], ns: 'ns1' },
          { loc: { start: 627, end: 649 }, content: "'translation.specific'", keypaths: ['translation.specific'], ns: 'ns2' },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/translation-render.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('with default prefix', async () => {
      const content = reactI18nextFiles.withDefaultPrefix
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 393, end: 408 }, content: "'options.title'", keypaths: ['prefix.options.title'], ns: 'translation', prefix: 'prefix' },
          { loc: { start: 428, end: 449 }, content: "'options.description'", keypaths: ['prefix.options.description'], prefix: 'prefix' },
          { loc: { start: 471, end: 496 }, content: "'options.nested.deep.key'", keypaths: ['prefix.options.nested.deep.key'], prefix: 'prefix' },
        ],
        content,
        { ns: defaultReactI18nextNs },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/with-default-prefix.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })
  })

  suite('linked messages', () => {
    function mock(items: { ns: string; locale: string; data: Record<string, string> }[]) {
      resourceService.setTestModule(
        items.map((item) => ({
          relativePath: `locales/${item.locale}/${item.ns}.json`,
          content: JSON.stringify(item.data),
        })),
        {
          globPattern: 'locales/**/*.json',
          layout: '{locale}/{namespace}.json',
          framework: 'react-i18next',
          defaultNs: defaultReactI18nextNs,
          sortKeys: true,
        },
      )
    }

    suite('resolving', () => {
      test('resolves $t(key)', () => {
        mock([{ ns: 'translation', locale: 'en', data: { greeting: 'Hello', message: 'Say $t(greeting)!' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath('translation')
        const result = resolveMessageReferences(translations['message']['en'], 'en', 'translation')
        assert.strictEqual(result, 'Say Hello!')
      })

      test('resolves $t(ns:key) cross-ns', () => {
        mock([
          { ns: 'ns1', locale: 'en', data: { greeting: 'Hi', localRef: '$t(greeting), {{user}}' } },
          {
            ns: 'ns2',
            locale: 'en',
            data: { greeting: 'Hello', ref: '$t(ns1:greeting), {{user}}', localRef: '$t(greeting)' },
          },
        ])
        const translationsNs1 = resourceService.getFlatTranslationsPerKeypath('ns1')
        const translationsNs2 = resourceService.getFlatTranslationsPerKeypath('ns2')

        const resultCurrNs = resolveMessageReferences(translationsNs1['localRef']['en'], 'en', 'ns1')
        assert.strictEqual(resultCurrNs, 'Hi, {{user}}')

        const resultOtherNs = resolveMessageReferences(translationsNs2['ref']['en'], 'en', 'ns2')
        assert.strictEqual(resultOtherNs, 'Hi, {{user}}')

        const resultOtherNsLocal = resolveMessageReferences(translationsNs2['localRef']['en'], 'en', 'ns2')
        assert.strictEqual(resultOtherNsLocal, 'Hello')
      })

      test('handles multiple same refs in value', () => {
        mock([{ ns: 'translation', locale: 'en', data: { name: 'World', ref: 'Hi $t(name), welcome $t(name)' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath('translation')
        const result = resolveMessageReferences(translations['ref']['en'], 'en', 'translation')
        assert.strictEqual(result, 'Hi World, welcome World')
      })

      test('does not fallback to other locale', () => {
        mock([
          { ns: 'translation', locale: 'en', data: { greeting: 'Hello', ref: '$t(greeting)' } },
          { ns: 'translation', locale: 'de', data: { ref: '$t(greeting)' } }, // greeting missing in de
        ])
        const translations = resourceService.getFlatTranslationsPerKeypath('translation')
        const resultDe = resolveMessageReferences(translations['ref']['de'], 'de', 'translation')
        assert.strictEqual(resultDe, '[missing: greeting]')

        const resultEn = resolveMessageReferences(translations['ref']['en'], 'en', 'translation')
        assert.strictEqual(resultEn, 'Hello')
      })

      test('handles circular reference', () => {
        mock([{ ns: 'translation', locale: 'en', data: { a: 'Hi, $t(b)', b: '$t(a)' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath('translation')
        const result = resolveMessageReferences(translations['a']['en'], 'en', 'translation')
        assert.strictEqual(result, 'Hi, Hi, [circular: b]') // visited all unless started to repeat
      })

      test('respects max depth', () => {
        const data: Record<string, string> = {}
        for (let i = 0; i < 15; i++) {
          data[`k${i}`] = `$t(k${i + 1})`
        }
        data['k15'] = 'end'
        mock([{ ns: 'translation', locale: 'en', data }])
        const translations = resourceService.getFlatTranslationsPerKeypath('translation')
        const result = resolveMessageReferences(translations['k0']['en'], 'en', 'translation')
        assert.strictEqual(result, '$t(k12)')
      })
    })

    suite('refactoring on key rename', () => {
      test('updates $t(oldKey) to $t(newKey)', async () => {
        mock([{ ns: 'translation', locale: 'en', data: { oldKey: 'value', ref: 'See $t(oldKey)' } }])
        await resourceService.renameKeypathInternally('oldKey', 'newKey', 'translation')

        const content = resourceService
          .view('default')!
          .manager.getAllFileContents()
          .get('locales/en/translation.json')!
        const data = JSON.parse(content)
        assert.strictEqual(data.ref, 'See $t(newKey)')
      })

      test('updates $t(ns:oldKey) cross-ns reference', async () => {
        mock([
          { ns: 'ns1', locale: 'en', data: { sharedKey: 'shared value' } },
          {
            ns: 'ns2',
            locale: 'en',
            data: { ref: 'Uses $t(ns1:sharedKey) and $t(sharedKey)', sharedKey: 'local shared key' },
          },
        ])
        await resourceService.renameKeypathInternally('sharedKey', 'renamedKey', 'ns1')

        const content = resourceService.view('default')!.manager.getAllFileContents().get('locales/en/ns2.json')!
        const data = JSON.parse(content)
        assert.strictEqual(data.ref, 'Uses $t(ns1:renamedKey) and $t(sharedKey)')
      })

      test('handles multiple same refs in value', async () => {
        mock([{ ns: 'translation', locale: 'en', data: { name: 'App', ref: 'From $t(name) to $t(name)' } }])
        await resourceService.renameKeypathInternally('name', 'appName', 'translation')

        const content = resourceService
          .view('default')!
          .manager.getAllFileContents()
          .get('locales/en/translation.json')!
        const data = JSON.parse(content)
        assert.strictEqual(data.ref, 'From $t(appName) to $t(appName)')
      })

      test('updates refs in all locales, skips missing', async () => {
        mock([
          { ns: 'translation', locale: 'en', data: { name: 'App', ref: 'From App' } },
          { ns: 'translation', locale: 'de', data: { name: 'App', ref: 'Von $t(name)' } },
        ])
        await resourceService.renameKeypathInternally('name', 'appName', 'translation')

        const contents = resourceService.view('default')!.manager.getAllFileContents()
        assert.strictEqual(JSON.parse(contents.get('locales/en/translation.json')!).ref, 'From App')
        assert.strictEqual(JSON.parse(contents.get('locales/de/translation.json')!).ref, 'Von $t(appName)')
      })
    })
  })

  suite('plurals keypath expansion', () => {
    suiteTeardown(async () => {
      setLocales(['en', 'de', 'ru'])
    })

    test('basic plurals and ordinals (en,de)', async () => {
      setLocales(['en', 'de'])
      const content = reactI18nextFiles.plurals
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          // basic plurals with count; in resources _zero exists so we expect it!
          { loc: { start: 222, end: 228 }, content: "'item'", keypaths: ['item_zero', 'item_one', 'item_other'] },
          // plural with variable count
          { loc: { start: 323, end: 332 }, content: "'message'", keypaths: ['message_one', 'message_other'] },
          // plural with additional interpolation
          { loc: { start: 418, end: 424 }, content: "'cart'", keypaths: ['cart_one', 'cart_other'] },
          { loc: { start: 517, end: 523 }, content: "'cart'", keypaths: ['cart_one', 'cart_other'] },
          // context + plural combined
          { loc: { start: 622, end: 630 }, content: "'friend'", keypaths: ['friend_male_one', 'friend_male_other'] },
          { loc: { start: 689, end: 697 }, content: "'friend'", keypaths: ['friend_female_one', 'friend_female_other'] },
          // context + plural with extra params
          { loc: { start: 806, end: 820 }, content: "'notification'", keypaths: ['notification_unread_one', 'notification_unread_other'] },
          // ordinals (en has one/two/few/other)
          { loc: { start: 943, end: 950 }, content: "'place'", keypaths: ['place_ordinal_one', 'place_ordinal_two', 'place_ordinal_few', 'place_ordinal_other'], ordinal: true },
          { loc: { start: 1003, end: 1010 }, content: "'place'", keypaths: ['place_ordinal_one', 'place_ordinal_two', 'place_ordinal_few', 'place_ordinal_other'], ordinal: true },
          // ordinal with extra params
          { loc: { start: 1115, end: 1124 }, content: "'ranking'", keypaths: ['ranking_ordinal_one', 'ranking_ordinal_two', 'ranking_ordinal_few', 'ranking_ordinal_other'], ordinal: true },
          // context + ordinal
          { loc: { start: 1193, end: 1201 }, content: "'finish'", keypaths: ['finish_male_ordinal_one', 'finish_male_ordinal_two', 'finish_male_ordinal_few', 'finish_male_ordinal_other'], ordinal: true },
        ],
        content,
        { ns: defaultReactI18nextNs, type: 'plurals' },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/plurals.tsx`))
      assert.deepEqual(ranges, expectedRanges)
    })

    test('extended plurals (en,de,ru)', async () => {
      setLocales(['en', 'de', 'ru'])
      const content = reactI18nextFiles.plurals
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 222, end: 228 }, content: "'item'", keypaths: ['item_zero', 'item_one', 'item_few', 'item_many', 'item_other'] },
          { loc: { start: 323, end: 332 }, content: "'message'", keypaths: ['message_one', 'message_few', 'message_many', 'message_other'] },
        ],
        content,
        { ns: defaultReactI18nextNs, type: 'plurals' },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/plurals.tsx`))

      let notFound = false
      for (const expected of expectedRanges) {
        notFound = !ranges.find((r) => isEqualWith(r, expected))
      }

      assert.ok(!notFound, 'One of expected key ranges not found in result')
    })

    test('minimal ordinals (de)', async () => {
      setLocales(['de'])
      const content = reactI18nextFiles.plurals
      let expectedRanges: KeypathInfo[] = fillMissingData(
        // prettier-ignore
        [
          { loc: { start: 943, end: 950 }, content: "'place'", keypaths: ['place_ordinal_other'] },
          { loc: { start: 1003, end: 1010 }, content: "'place'", keypaths: ['place_ordinal_other'] },
          { loc: { start: 1115, end: 1124 }, content: "'ranking'", keypaths: ['ranking_ordinal_other'] },
          { loc: { start: 1193, end: 1201 }, content: "'finish'", keypaths: ['finish_male_ordinal_other'] },
        ],
        content,
        { ns: defaultReactI18nextNs, type: 'plurals', ordinal: true },
      )

      const ranges = await getKeyRanges(content, vscode.Uri.file(`${codePath}/plurals.tsx`))

      let notFound = false
      for (const expected of expectedRanges) {
        notFound = !ranges.find((r) => isEqualWith(r, expected))
      }

      assert.ok(!notFound, 'One of expected key ranges not found in result')
    })
  })

  suite('extraction and t-func insertion', () => {
    let document: vscode.TextDocument
    let editor: vscode.TextEditor

    teardown(async () => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    })

    suite('all contexts in single file', () => {
      setup(async () => {
        editor = await openUntitledDoc(reactI18nextFiles.allContexts, 'tsx')
        document = editor.document
      })

      test('one', async () => {
        const location = { start: 318, end: 321 }
        const expectedContent = reactI18nextFiles.allContexts.replace("'one'", `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace("'one'", `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('two', async () => {
        const location = { start: 394, end: 397 }
        const expectedContent = reactI18nextFiles.allContexts.replace("'two'", `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace("'two'", `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('three', async () => {
        const location = { start: 471, end: 483 }
        const expectedContent = reactI18nextFiles.allContexts.replace(
          '`three ${val}`',
          `t("${TEST_KEY_NAME}", { val })`,
        )
        const expectedContentSingle = reactI18nextFiles.allContexts.replace(
          '`three ${val}`',
          `t('${TEST_KEY_NAME}', { val })`,
        )

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('four', async () => {
        const location = { start: 494, end: 498 }
        const expectedContent = reactI18nextFiles.allContexts.replace("'four'", `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace("'four'", `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('five', async () => {
        const location = { start: 575, end: 579 }
        const expectedContent = reactI18nextFiles.allContexts.replace('`five`', `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace('`five`', `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('six', async () => {
        const location = { start: 590, end: 593 }
        const expectedContent = reactI18nextFiles.allContexts.replace("'six'", `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace("'six'", `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('seven', async () => {
        const location = { start: 601, end: 606 }
        const expectedContent = reactI18nextFiles.allContexts.replace('"seven"', `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace('"seven"', `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('eight', async () => {
        const location = { start: 688, end: 693 }
        const expectedContent = reactI18nextFiles.allContexts.replace('"eight"', `{t("${TEST_KEY_NAME}")}`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace('"eight"', `{t('${TEST_KEY_NAME}')}`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      // textBoundDetector can't handle JSX comments yet
      test.skip('nine', async () => {
        const location = { start: 745, end: 749 }
        const expectedContent = reactI18nextFiles.allContexts.replace('nine', `{t("${TEST_KEY_NAME}")}`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace('nine', `{t('${TEST_KEY_NAME}')}`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('ten', async () => {
        const location = { start: 851, end: 854 }
        const expectedContent = reactI18nextFiles.allContexts.replace("'ten'", `t("${TEST_KEY_NAME}")`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace("'ten'", `t('${TEST_KEY_NAME}')`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('eleven', async () => {
        const location = { start: 928, end: 946 }
        const expectedContent = reactI18nextFiles.allContexts.replace(
          '`eleven ${myString}`',
          `t("${TEST_KEY_NAME}", { myString })`,
        )
        const expectedContentSingle = reactI18nextFiles.allContexts.replace(
          '`eleven ${myString}`',
          `t('${TEST_KEY_NAME}', { myString })`,
        )

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })

      test('twelve', async () => {
        const location = { start: 973, end: 979 }
        const expectedContent = reactI18nextFiles.allContexts.replace('twelve', `{t("${TEST_KEY_NAME}")}`)
        const expectedContentSingle = reactI18nextFiles.allContexts.replace('twelve', `{t('${TEST_KEY_NAME}')}`)

        resourceService.view('default')!.module.usages.quoteType = 'double'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContent, false, 'tsx')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, reactI18nextFiles.allContexts, location, expectedContentSingle, false, 'tsx')
      })
    })
  })
})
