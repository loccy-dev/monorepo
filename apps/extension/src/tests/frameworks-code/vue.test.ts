import * as vscode from 'vscode'
import fs from 'fs'
import assert from 'assert'
import path from 'path'
import { cloneDeep } from 'lodash'
import { cfg } from '../../global-config'
import { BaseNode } from '../../types'
import { getNodeAtCursor } from '../../editor-integration/cursor-context/get-node-at-cursor'
import { CursorContextVue } from '../../editor-integration/cursor-context/vue/cursor-context-vue.types'
import { detectCursorContextVueAst } from '../../editor-integration/cursor-context/vue/detect-cursor-context-vue-ast'
import { detectCursorContextVueManual } from '../../editor-integration/cursor-context/vue/detect-cursor-context-vue-manual'
import { assertRange, openUntitledDoc } from '../test-helpers'

const testProjectPath = path.join(__dirname, '../../../src/tests/test-projects/vue-i18n')
const codePath = path.join(testProjectPath, 'src/unit-tests')

const testMixFileContent = fs.readFileSync(path.join(codePath, 'mix.vue'), 'utf8')
const testHelperFileContent = fs.readFileSync(path.join(codePath, 'extraction-in-script.js'), 'utf8')

suite('vue', async () => {
  const defaultConfig = cloneDeep(cfg.settings)

  suiteTeardown(async () => {
    cfg.settings = defaultConfig
  })

  suite('getNodeAtCursor', () => {
    let document: vscode.TextDocument
    let editor: vscode.TextEditor

    async function assertNode(start: number, end: number, value: string) {
      for (let i = start; i <= end; i++) {
        const startPos = editor.document.positionAt(i)
        editor.selection = new vscode.Selection(startPos, startPos)

        const result = getNodeAtCursor()
        const node = result.node as BaseNode | null

        assert.notEqual(node, null)
        if (!node) {
          return
        }
        assert.strictEqual(node.loc.start, start)
        assert.strictEqual(node.loc.end, end)
        assert.strictEqual(node.value, value)
      }
    }

    suite('vue file', () => {
      suiteSetup(async () => {
        editor = await openUntitledDoc(testMixFileContent, 'vue')
        document = editor.document
      })

      suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      })

      test('attr', async () => {
        await assertNode(21, 26, 'title')
      })

      test('str inside directive', async () => {
        await assertNode(38, 50, "I'm tooltip")
      })

      test('str inside arr inside directive', async () => {
        await assertNode(63, 65, 'hi')
      })

      test('str inside object inside directive v1', async () => {
        await assertNode(84, 89, 'first')
      })

      test('str inside object inside directive v2', async () => {
        await assertNode(98, 104, 'second')
      })

      test('str inside @click directive', async () => {
        await assertNode(129, 138, 'attention')
      })

      test('tag value', async () => {
        await assertNode(142, 152, 'Title text')
      })

      test('multiline tag value', async () => {
        await assertNode(179, 220, 'Multiline paragraph with weird formatting')
      })

      test('str inside interpolation', async () => {
        await assertNode(248, 252, 'Hi, ')
      })

      test('backtik in attr', async () => {
        await assertNode(289, 291, 'hi')
      })

      test('str inside $t()', async () => {
        await assertNode(301, 313, 'Test.keypath')
      })

      test('cyrillic + punctuation', async () => {
        await assertNode(329, 338, 'Как дел?!')
      })

      test('str in vue-script data', async () => {
        await assertNode(504, 514, 'hi there! ')
      })

      test('str in vue-scriptSetup', async () => {
        await assertNode(647, 651, 'John')
      })
    })

    suite('script file', async () => {
      suiteSetup(async () => {
        editor = await openUntitledDoc(testHelperFileContent, 'js')
        document = editor.document
      })

      suiteTeardown(async () => {
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
      })

      test('Simple string', async () => {
        await assertNode(34, 41, 'Windows')
      })

      test('String literal', async () => {
        await assertNode(129, 144, 'Hi, ${userName}')
      })

      test('String with nested quotes 1', async () => {
        await assertNode(170, 193, "I'm her'e ye's \"bro\".")
      })

      test('String with nested quotes 2', async () => {
        await assertNode(218, 232, 'Im here,  bro"')
      })

      test('StringLiteral inside TemplateLiteral', async () => {
        await assertNode(274, 276, 'hi')
      })
    })
  })

  suite('context detection (AST)', () => {
    test('TEMPLATE_TAG', () => {
      assertRange(10, 13, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(142, 152, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(176, 223, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(227, 238, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(227, 238, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(244, 244, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(267, 267, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(274, 277, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(322, 323, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
    })

    test('VUE_DIRECTIVE', () => {
      assertRange(37, 51, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.VUE_DIRECTIVE)
      assertRange(61, 67, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.VUE_DIRECTIVE)

      assertRange(77, 106, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.VUE_DIRECTIVE)
      assertRange(116, 140, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.VUE_DIRECTIVE)

      assertRange(288, 292, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.VUE_DIRECTIVE)
    })

    test('TEMPLATE_INTERPOLATION', () => {
      assertRange(
        246,
        265,
        (pos) => detectCursorContextVueAst(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_INTERPOLATION,
      )
      assertRange(
        296,
        316,
        (pos) => detectCursorContextVueAst(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_INTERPOLATION,
      )
    })

    test('SCRIPT_OPTIONS', () => {
      assertRange(
        375,
        593,
        (pos) => detectCursorContextVueAst(testMixFileContent, pos),
        CursorContextVue.SCRIPT_OPTIONS,
      )
    })

    test('SCRIPT_SETUP', () => {
      assertRange(628, 654, (pos) => detectCursorContextVueAst(testMixFileContent, pos), CursorContextVue.SCRIPT_SETUP)
    })
  })

  suite('context detection (manual)', () => {
    test('TEMPLATE_TAG', () => {
      assertRange(10, 13, (pos) => detectCursorContextVueManual(testMixFileContent, pos), CursorContextVue.TEMPLATE_TAG)
      assertRange(
        142,
        152,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        176,
        223,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        227,
        238,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        227,
        238,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        244,
        244,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        267,
        267,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        274,
        277,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
      assertRange(
        322,
        323,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_TAG,
      )
    })

    test('VUE_DIRECTIVE', () => {
      assertRange(
        37,
        51,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.VUE_DIRECTIVE,
      )
      assertRange(
        61,
        67,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.VUE_DIRECTIVE,
      )
      assertRange(
        77,
        106,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.VUE_DIRECTIVE,
      )
      // assertRange(116, 140, (pos) => detectVueContextManually(testMixFileContent, pos), VueContext.VUE_DIRECTIVE) - too tricky to solve, but AST makes possible
      assertRange(
        288,
        292,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.VUE_DIRECTIVE,
      )
    })

    test('TEMPLATE_INTERPOLATION', () => {
      assertRange(
        246,
        265,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_INTERPOLATION,
      )
      assertRange(
        296,
        316,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.TEMPLATE_INTERPOLATION,
      )
    })

    test('SCRIPT_OPTIONS', () => {
      assertRange(
        375,
        593,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.SCRIPT_OPTIONS,
      )
    })

    test('SCRIPT_SETUP', () => {
      assertRange(
        628,
        654,
        (pos) => detectCursorContextVueManual(testMixFileContent, pos),
        CursorContextVue.SCRIPT_SETUP,
      )
    })
  })
})
