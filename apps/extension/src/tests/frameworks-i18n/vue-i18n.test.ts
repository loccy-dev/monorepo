import * as vscode from 'vscode'
import fs from 'fs'
import assert from 'assert'
import path from 'path'
import { cloneDeep } from 'lodash'
import { getKeyRanges } from '../../editor-integration/frameworks/get-key-ranges'
import { resolveMessageReferences } from '../../editor-integration/frameworks/resolve-message-references'
import { cfg } from '../../global-config'
import type { KeypathInfo } from '@repo/types/framework.types'
import { fillMissingData, openUntitledDoc, TEST_KEY_NAME, testInsertion } from '../test-helpers'
import { resourceService } from '../../helpers/resource-service'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'

const testProjectPath = path.join(__dirname, '../../../src/tests/test-projects/vue-i18n')
const codePath = path.join(testProjectPath, 'src/unit-tests')
const translationFilePath = path.join(testProjectPath, 'src/locales')

const testMixFileContent = fs.readFileSync(path.join(codePath, 'mix.vue'), 'utf8')
const testKeysFileContent = fs.readFileSync(path.join(codePath, 'keys.vue'), 'utf8')
const testHelperFileContent = fs.readFileSync(path.join(codePath, 'extraction-in-script.js'), 'utf8')

const testEnResources = fs.readFileSync(path.join(translationFilePath, 'en.json'), 'utf8')
const testDeResources = fs.readFileSync(path.join(translationFilePath, 'de.json'), 'utf8')
const testRuResources = fs.readFileSync(path.join(translationFilePath, 'ru.json'), 'utf8')

suite('vue-i18n project', function () {
  const defaultConfig = cloneDeep(cfg.settings)
  const defaultResolvedConfig = cfg.resolvedConfig

  suiteSetup(async () => {
    cfg.resolvedConfig = {
      modules: {
        default: {
          name: 'default',
          framework: 'vue-i18n',
          translations: { messageFormat: 'vue-pipe', glob: '**/*.json', layout: '{locale}.json' },
          usages: { include: ['**/*'] },
        },
      },
    }
  })

  suiteTeardown(async () => {
    cfg.settings = defaultConfig
    cfg.resolvedConfig = defaultResolvedConfig
  })

  suite('keypath detection', () => {
    test('all in one', async () => {
      resourceService.setTestModule(
        [
          { relativePath: `${translationFilePath}/en.json`, content: testEnResources },
          { relativePath: `${translationFilePath}/de.json`, content: testDeResources },
          { relativePath: `${translationFilePath}/ru.json`, content: testRuResources },
        ],
        {
          globPattern: `${translationFilePath}/*.json`,
          layout: '{locale}.json',
          framework: 'vue-i18n',
          sortKeys: true,
        },
      )

      const expectedRanges: KeypathInfo[] = fillMissingData(
        [
          // Template section
          { loc: { start: 65, end: 77 }, content: "'simple.key'", keypaths: ['simple.key'] },
          { loc: { start: 101, end: 120 }, content: "'double.quoted.key'", keypaths: ['double.quoted.key'] },
          { loc: { start: 144, end: 166 }, content: '`template.literal.key`', keypaths: ['template.literal.key'] },

          // With parameters
          { loc: { start: 216, end: 229 }, content: "'with.params'", keypaths: ['with.params'] },
          { loc: { start: 278, end: 289 }, content: "'with.list'", keypaths: ['with.list'] },
          { loc: { start: 339, end: 352 }, content: "'with.number'", keypaths: ['with.number'], type: 'plurals' },
          { loc: { start: 376, end: 390 }, content: "'with.default'", keypaths: ['with.default'] },
          { loc: { start: 438, end: 451 }, content: "'with.locale'", keypaths: ['with.locale'] },
          { loc: { start: 484, end: 501 }, content: "'with.all.params'", keypaths: ['with.all.params'] },

          // In attributes
          { loc: { start: 580, end: 597 }, content: "'attribute.title'", keypaths: ['attribute.title'] },
          { loc: { start: 631, end: 654 }, content: "'attribute.placeholder'", keypaths: ['attribute.placeholder'] },
          { loc: { start: 705, end: 726 }, content: "'accessibility.label'", keypaths: ['accessibility.label'] },

          // In directives
          { loc: { start: 778, end: 795 }, content: "'conditional.key'", keypaths: ['conditional.key'] },
          { loc: { start: 845, end: 861 }, content: "'visibility.key'", keypaths: ['visibility.key'] },
          { loc: { start: 904, end: 916 }, content: "'list.item1'", keypaths: ['list.item1'] },
          { loc: { start: 922, end: 934 }, content: "'list.item2'", keypaths: ['list.item2'] },

          // Complex expressions
          { loc: { start: 1026, end: 1044 }, content: "'concatenated.key'", keypaths: ['concatenated.key'] },
          { loc: { start: 1091, end: 1113 }, content: "'embedded.in.template'", keypaths: ['embedded.in.template'] },
          { loc: { start: 1145, end: 1164 }, content: "'ternary.condition'", keypaths: ['ternary.condition'] },
          { loc: { start: 1171, end: 1185 }, content: "'ternary.true'", keypaths: ['ternary.true'] },
          { loc: { start: 1192, end: 1207 }, content: "'ternary.false'", keypaths: ['ternary.false'] },

          // Nested calls
          { loc: { start: 1303, end: 1315 }, content: "'parent.key'", keypaths: ['parent.key'] },
          { loc: { start: 1329, end: 1340 }, content: "'child.key'", keypaths: ['child.key'] },

          // Event handlers
          { loc: { start: 1402, end: 1416 }, content: "'button.click'", keypaths: ['button.click'] },
          { loc: { start: 1473, end: 1493 }, content: "'arrow.function.key'", keypaths: ['arrow.function.key'] },
          { loc: { start: 1545, end: 1563 }, content: "'method.param.key'", keypaths: ['method.param.key'] },
          { loc: { start: 1621, end: 1631 }, content: 'dynamicKey', keypaths: [], type: 'dynamic-undefined' },

          // Dynamic keys with static parts
          { loc: { start: 1655, end: 1674 }, content: '`dynamic.${suffix}`', keypaths: [], type: 'dynamic-undefined' },
          {
            loc: { start: 1698, end: 1719 },
            content: "'dynamic.' + variable",
            keypaths: [],
            type: 'dynamic-undefined',
          },

          // Special characters in keys
          {
            loc: { start: 1782, end: 1807 },
            content: "'special-chars.with-dash'",
            keypaths: ['special-chars.with-dash'],
          },
          {
            loc: { start: 1831, end: 1862 },
            content: "'special_chars.with_underscore'",
            keypaths: ['special_chars.with_underscore'],
          },
          {
            loc: { start: 1886, end: 1913 },
            content: "'special.chars.123.numbers'",
            keypaths: ['special.chars.123.numbers'],
          },
          { loc: { start: 1937, end: 1952 }, content: "'UPPERCASE.KEY'", keypaths: ['UPPERCASE.KEY'] },

          // Multiple params variations
          // numeric-literal 2nd arg → plural call, single key typed 'plurals'
          { loc: { start: 2015, end: 2030 }, content: "'plural.apples'", keypaths: ['plural.apples'], type: 'plurals' },
          { loc: { start: 2057, end: 2072 }, content: "'plural.apples'", keypaths: ['plural.apples'], type: 'plurals' },
          { loc: { start: 2099, end: 2114 }, content: "'plural.apples'", keypaths: ['plural.apples'], type: 'plurals' },
          // object 2nd arg ({ count }) is not a numeric literal → stays static
          { loc: { start: 2141, end: 2156 }, content: "'plural.custom'", keypaths: ['plural.custom'] },

          // Options API - Script section
          { loc: { start: 2485, end: 2505 }, content: "'data.initial.value'", keypaths: ['data.initial.value'] },

          // Computed properties
          { loc: { start: 2625, end: 2643 }, content: "'computed.message'", keypaths: ['computed.message'] },
          { loc: { start: 2700, end: 2722 }, content: "'computed.with.params'", keypaths: ['computed.with.params'] },
          { loc: { start: 2825, end: 2845 }, content: "'computed.has.items'", keypaths: ['computed.has.items'] },
          { loc: { start: 2881, end: 2900 }, content: "'computed.no.items'", keypaths: ['computed.no.items'] },

          // Watchers
          { loc: { start: 3006, end: 3023 }, content: "'watcher.changed'", keypaths: ['watcher.changed'] },
          { loc: { start: 3116, end: 3130 }, content: "'watcher.deep'", keypaths: ['watcher.deep'] },

          // Lifecycle hooks
          { loc: { start: 3265, end: 3284 }, content: "'lifecycle.mounted'", keypaths: ['lifecycle.mounted'] },
          {
            loc: { start: 3311, end: 3340 },
            content: "'lifecycle.mounted.with.time'",
            keypaths: ['lifecycle.mounted.with.time'],
          },
          { loc: { start: 3468, end: 3491 }, content: "'async.timeout.message'", keypaths: ['async.timeout.message'] },
          { loc: { start: 3564, end: 3587 }, content: "'async.promise.message'", keypaths: ['async.promise.message'] },
          { loc: { start: 3646, end: 3665 }, content: "'lifecycle.unmount'", keypaths: ['lifecycle.unmount'] },

          // Methods
          { loc: { start: 3775, end: 3791 }, content: "'method.clicked'", keypaths: ['method.clicked'] },
          { loc: { start: 3822, end: 3843 }, content: "'method.return.value'", keypaths: ['method.return.value'] },
          { loc: { start: 3904, end: 3907 }, content: 'key', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 3993, end: 4011 }, content: "'method.formatted'", keypaths: ['method.formatted'] },
          { loc: { start: 4142, end: 4165 }, content: "'method.local.variable'", keypaths: ['method.local.variable'] },
          { loc: { start: 4196, end: 4216 }, content: "'method.array.item1'", keypaths: ['method.array.item1'] },
          { loc: { start: 4227, end: 4247 }, content: "'method.array.item2'", keypaths: ['method.array.item2'] },
          { loc: { start: 4295, end: 4317 }, content: "'method.object.value1'", keypaths: ['method.object.value1'] },
          { loc: { start: 4342, end: 4364 }, content: "'method.object.value2'", keypaths: ['method.object.value2'] },
          { loc: { start: 4442, end: 4464 }, content: "'method.error.message'", keypaths: ['method.error.message'] },
          { loc: { start: 4517, end: 4539 }, content: "'method.catch.message'", keypaths: ['method.catch.message'] },
          { loc: { start: 4643, end: 4663 }, content: "'method.switch.zero'", keypaths: ['method.switch.zero'] },
          { loc: { start: 4706, end: 4725 }, content: "'method.switch.one'", keypaths: ['method.switch.one'] },
          { loc: { start: 4769, end: 4789 }, content: "'method.switch.many'", keypaths: ['method.switch.many'] },

          // Script setup section
          { loc: { start: 5071, end: 5092 }, content: "'setup.basic.message'", keypaths: ['setup.basic.message'] },
          { loc: { start: 5120, end: 5139 }, content: "'setup.with.params'", keypaths: ['setup.with.params'] },
          { loc: { start: 5259, end: 5274 }, content: "'setup.counter'", keypaths: ['setup.counter'] },

          // Composable
          { loc: { start: 5599, end: 5619 }, content: "'composable.message'", keypaths: ['composable.message'] },
          { loc: { start: 5661, end: 5664 }, content: 'key', keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 5744, end: 5764 }, content: "'composable.dynamic'", keypaths: ['composable.dynamic'] },

          // Setup lifecycle
          { loc: { start: 5922, end: 5937 }, content: "'setup.mounted'", keypaths: ['setup.mounted'] },
          { loc: { start: 6027, end: 6049 }, content: "'setup.async.resolved'", keypaths: ['setup.async.resolved'] },

          // Setup watchers
          { loc: { start: 6134, end: 6155 }, content: "'setup.watch.counter'", keypaths: ['setup.watch.counter'] },

          // Arrow functions
          { loc: { start: 6239, end: 6261 }, content: "'setup.arrow.function'", keypaths: ['setup.arrow.function'] },
          {
            loc: { start: 6310, end: 6334 },
            content: "'setup.arrow.with.param'",
            keypaths: ['setup.arrow.with.param'],
          },

          // Different expression contexts
          { loc: { start: 6439, end: 6455 }, content: "'setup.positive'", keypaths: ['setup.positive'] },
          { loc: { start: 6461, end: 6473 }, content: "'setup.zero'", keypaths: ['setup.zero'] },
          {
            loc: { start: 6511, end: 6536 },
            content: "'setup.template.embedded'",
            keypaths: ['setup.template.embedded'],
          },
          { loc: { start: 6588, end: 6608 }, content: "'setup.concatenated'", keypaths: ['setup.concatenated'] },

          // Arrays and objects
          { loc: { start: 6681, end: 6696 }, content: "'setup.array.0'", keypaths: ['setup.array.0'] },
          { loc: { start: 6701, end: 6716 }, content: "'setup.array.1'", keypaths: ['setup.array.1'] },
          { loc: { start: 6721, end: 6736 }, content: "'setup.array.2'", keypaths: ['setup.array.2'] },
          { loc: { start: 6776, end: 6796 }, content: "'setup.object.first'", keypaths: ['setup.object.first'] },
          { loc: { start: 6811, end: 6832 }, content: "'setup.object.second'", keypaths: ['setup.object.second'] },
          {
            loc: { start: 6859, end: 6885 },
            content: "'setup.object.nested.deep'",
            keypaths: ['setup.object.nested.deep'],
          },

          // Edge cases
          { loc: { start: 6929, end: 6931 }, content: "''", keypaths: [], type: 'dynamic-undefined' },
          { loc: { start: 6957, end: 6961 }, content: "'  '", keypaths: ['  '] },
          {
            loc: { start: 6985, end: 7047 },
            content: "'very.long.key.path.that.goes.on.and.on.and.on.testing.limits'",
            keypaths: ['very.long.key.path.that.goes.on.and.on.and.on.testing.limits'],
          },
          { loc: { start: 7070, end: 7088 }, content: "'unicode.😀.emoji'", keypaths: ['unicode.😀.emoji'] },
          {
            loc: { start: 7111, end: 7134 },
            content: "'escaped\\.dot\\.in\\.key'",
            keypaths: ['escaped\\.dot\\.in\\.key'],
          },

          // <i18n-t />
          {
            loc: { start: 7354, end: 7364 },
            content: '"some.key"',
            keypaths: ['some.key'],
          },
          {
            loc: { start: 7394, end: 7409 },
            content: '"`some.` + key"',
            keypaths: [],
            type: 'dynamic-undefined',
          },
          // existing key - check not duplicated (t-func + generic matches)
          {
            loc: { start: 7456, end: 7478 },
            content: '"AppFooter.areYouSure"',
            keypaths: ['AppFooter.areYouSure'],
            type: 'static',
          },

          // starts as dynamic but static, should not be duplicated
          {
            loc: { start: 7563, end: 7585 },
            content: '"\'DropdownMenu.light\'"',
            keypaths: ['DropdownMenu.light'],
            type: 'static',
          },
          {
            loc: { start: 7615, end: 7637 },
            content: '"`DropdownMenu.light`"',
            keypaths: ['DropdownMenu.light'],
            type: 'static',
          },

          // generics inside dynamic - shouldn't happen
          {
            loc: { start: 7692, end: 7715 },
            content: `'part.one' + 'part.two'`,
            keypaths: [], // real life: part.onepart.two
            type: 'dynamic-undefined', // real life: dynamic-defined
          },
        ],
        testKeysFileContent,
      )

      const uri = vscode.Uri.file('src/keys.vue')
      const ranges = await getKeyRanges(testKeysFileContent, uri)
      assert.deepEqual(ranges, expectedRanges)
    })
  })

  suite('linked messages', () => {
    function mock(items: { locale: string; data: Record<string, string> }[]) {
      resourceService.setTestModule(
        items.map((item) => ({
          relativePath: `locales/${item.locale}.json`,
          content: JSON.stringify(item.data),
        })),
        { globPattern: 'locales/*.json', layout: '{locale}.json', framework: 'vue-i18n', sortKeys: true },
      )
    }

    suite('resolving', () => {
      test('resolves @:key', () => {
        mock([{ locale: 'en', data: { greeting: 'Hello', message: 'Say @:greeting!' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['message']['en'], 'en', NS_WITHOUT_NS)
        assert.strictEqual(result, 'Say Hello!')
      })

      test('resolves nested @:key', () => {
        mock([{ locale: 'en', data: { a: '@:b', b: '@:c', c: 'done' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['a']['en'], 'en', NS_WITHOUT_NS)
        assert.strictEqual(result, 'done')
      })

      test('handles multiple same refs in value', () => {
        mock([{ locale: 'en', data: { name: 'World', ref: 'Hi @:name, welcome @:name' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['ref']['en'], 'en', NS_WITHOUT_NS)
        assert.strictEqual(result, 'Hi World, welcome World')
      })

      test('does not fallback to other locale', () => {
        mock([
          { locale: 'en', data: { greeting: 'Hello', ref: '@:greeting' } },
          { locale: 'de', data: { ref: '@:greeting' } }, // greeting missing in de
        ])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['ref']['de'], 'de', NS_WITHOUT_NS)
        assert.strictEqual(result, '[missing: greeting]')
      })

      test('handles circular reference', () => {
        mock([{ locale: 'en', data: { a: 'Hi, @:b', b: '@:a' } }])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['a']['en'], 'en', NS_WITHOUT_NS)
        assert.strictEqual(result, 'Hi, Hi, [circular: b]') // visited all unless started to repeat
      })

      test('respects max depth', () => {
        const data: Record<string, string> = {}
        for (let i = 0; i < 15; i++) {
          data[`k${i}`] = `@:k${i + 1}`
        }
        data['k15'] = 'end'
        mock([{ locale: 'en', data }])
        const translations = resourceService.getFlatTranslationsPerKeypath(NS_WITHOUT_NS)
        const result = resolveMessageReferences(translations['k0']['en'], 'en', NS_WITHOUT_NS)
        assert.strictEqual(result, '@:k12')
      })
    })

    suite('refactoring on key rename', () => {
      test('updates @:oldKey to @:newKey', async () => {
        mock([{ locale: 'en', data: { oldKey: 'value', ref: 'See @:oldKey' } }])
        await resourceService.renameKeypathInternally('oldKey', 'newKey')

        const content = resourceService.view('default')!.manager.getAllFileContents().get('locales/en.json')!
        const data = JSON.parse(content)
        assert.strictEqual(data.ref, 'See @:newKey')
      })

      test('handles multiple same refs in value', async () => {
        mock([{ locale: 'en', data: { name: 'App', ref: 'From @:name to @:name' } }])
        await resourceService.renameKeypathInternally('name', 'appName')

        const content = resourceService.view('default')!.manager.getAllFileContents().get('locales/en.json')!
        const data = JSON.parse(content)
        assert.strictEqual(data.ref, 'From @:appName to @:appName')
      })

      test('updates refs in all locales', async () => {
        mock([
          { locale: 'en', data: { name: 'App', ref: 'From @:name' } },
          { locale: 'de', data: { name: 'App', ref: 'Von @:name' } },
        ])
        await resourceService.renameKeypathInternally('name', 'appName')

        const contents = resourceService.view('default')!.manager.getAllFileContents()
        assert.strictEqual(JSON.parse(contents.get('locales/en.json')!).ref, 'From @:appName')
        assert.strictEqual(JSON.parse(contents.get('locales/de.json')!).ref, 'Von @:appName')
      })
    })
  })

  suite('extraction and t-func insertion', () => {
    let document: vscode.TextDocument
    let editor: vscode.TextEditor

    teardown(async () => {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    })

    suite('vue', () => {
      setup(async () => {
        editor = await openUntitledDoc(testMixFileContent, 'vue')
        document = editor.document
      })

      test('attr', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 21, end: 26 }
        const expectedContent = testMixFileContent.replace('id="title"', `:id="$t('${TEST_KEY_NAME}')"`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, false, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, false, 'vue')
      })

      test('v-directive', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 38, end: 50 }
        const expectedContent = testMixFileContent.replace(
          `v-tippy="'I\\'m tooltip'"`,
          `v-tippy="$t('${TEST_KEY_NAME}')"`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('v-directive with array inside', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 63, end: 65 }
        const expectedContent = testMixFileContent.replace(`:class="['hi']"`, `:class="[$t('${TEST_KEY_NAME}')]"`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('v-directive with object inside (part 1)', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 84, end: 89 }
        const expectedContent = testMixFileContent.replace(
          `:multi="{one: 'first',`,
          `:multi="{one: $t('${TEST_KEY_NAME}'),`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('v-directive with object inside (part 2)', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 98, end: 104 }
        const expectedContent = testMixFileContent.replace(
          `:multi="{one: 'first', two: 'second'}"`,
          `:multi="{one: 'first', two: $t('${TEST_KEY_NAME}')}"`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('event listener', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 129, end: 138 }
        const expectedContent = testMixFileContent.replace(
          `@click="() => alert('attention')"`,
          `@click="() => alert($t('${TEST_KEY_NAME}'))"`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('attr value', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 142, end: 152 }
        const expectedContent = testMixFileContent.replace(`>Title text<`, `>{{ $t("${TEST_KEY_NAME}") }}<`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, false, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testMixFileContent.replace(`>Title text<`, `>{{ $t('${TEST_KEY_NAME}') }}<`)
        await testInsertion(editor, testMixFileContent, location, expectedContentSingle, false, 'vue')
      })

      test('multiline - should preserve empty lines', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 179, end: 220 }
        const expectedContent = testMixFileContent.replace(
          `Multiline paragraph with weird formatting`,
          `{{ $t("${TEST_KEY_NAME}") }}`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContent, false, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testMixFileContent.replace(
          `Multiline paragraph with weird formatting`,
          `{{ $t('${TEST_KEY_NAME}') }}`,
        )
        await testInsertion(editor, testMixFileContent, location, expectedContentSingle, false, 'vue')
      })

      test('template interpolation', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 248, end: 252 }
        const expectedContent = testMixFileContent.replace(`'Hi, '`, `$t("${TEST_KEY_NAME}")`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testMixFileContent.replace(`'Hi, '`, `$t('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testMixFileContent, location, expectedContentSingle, true, 'vue')
      })

      test('js interpolation inside v-directive', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 289, end: 291 }
        const expectedContent = testMixFileContent.replace('`hi`', `$t('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')
      })

      test('script options', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 504, end: 514 }
        const expectedContent = testMixFileContent.replace('"hi there! "', `this.$t("${TEST_KEY_NAME}")`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testMixFileContent.replace('"hi there! "', `this.$t('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testMixFileContent, location, expectedContentSingle, true, 'vue')
      })

      test('script setup', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 647, end: 651 }
        const expectedContent = testMixFileContent.replace("'John'", `t("${TEST_KEY_NAME}")`)
        await testInsertion(editor, testMixFileContent, location, expectedContent, true, 'vue')

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testMixFileContent.replace("'John'", `t('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testMixFileContent, location, expectedContentSingle, true, 'vue')
      })
    })

    suite('plain script', () => {
      suiteSetup(() => {
        resourceService.view('default')!.module.usages.customTFunctions = ['$i18n']
      })

      suiteTeardown(() => {
        resourceService.view('default')!.module.usages.customTFunctions = []
      })

      setup(async () => {
        editor = await openUntitledDoc(testHelperFileContent, 'js')
        document = editor.document
      })

      test('object prop value', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 34, end: 41 }
        const expectedContent = testHelperFileContent.replace("'Windows'", `$i18n("${TEST_KEY_NAME}")`)
        await testInsertion(editor, testHelperFileContent, location, expectedContent, true)

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testHelperFileContent.replace("'Windows'", `$i18n('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testHelperFileContent, location, expectedContentSingle, true)
      })

      test('string variable', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 95, end: 102 }
        const expectedContent = testHelperFileContent.replace('"Dmitrii"', `$i18n("${TEST_KEY_NAME}")`)
        await testInsertion(editor, testHelperFileContent, location, expectedContent, true)

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testHelperFileContent.replace('"Dmitrii"', `$i18n('${TEST_KEY_NAME}')`)
        await testInsertion(editor, testHelperFileContent, location, expectedContentSingle, true)
      })

      test('nested quotes', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 170, end: 193 }
        const expectedContent = testHelperFileContent.replace(
          `"I'm her'e ye's \\"bro\\"."`,
          `$i18n("${TEST_KEY_NAME}")`,
        )
        await testInsertion(editor, testHelperFileContent, location, expectedContent, true)

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testHelperFileContent.replace(
          `"I'm her'e ye's \\"bro\\"."`,
          `$i18n('${TEST_KEY_NAME}')`,
        )
        await testInsertion(editor, testHelperFileContent, location, expectedContentSingle, true)
      })

      test('interpolation', async () => {
        resourceService.view('default')!.module.usages.quoteType = 'double'
        const location = { start: 129, end: 144 }
        const expectedContent = testHelperFileContent.replace(
          '`Hi, ${userName}`',
          `$i18n("${TEST_KEY_NAME}", { userName })`,
        )
        await testInsertion(editor, testHelperFileContent, location, expectedContent, true)

        resourceService.view('default')!.module.usages.quoteType = 'single'
        const expectedContentSingle = testHelperFileContent.replace(
          '`Hi, ${userName}`',
          `$i18n('${TEST_KEY_NAME}', { userName })`,
        )
        await testInsertion(editor, testHelperFileContent, location, expectedContentSingle, true)
      })
    })
  })
})
