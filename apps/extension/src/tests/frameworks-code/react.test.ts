import fs from 'fs'
import path from 'path'
import { cloneDeep } from 'lodash'
import { CursorContextReact } from '../../editor-integration/cursor-context/react/cursor-context-react.types'
import { detectCursorContextReact } from '../../editor-integration/cursor-context/react/detect-cursor-context-react'
import { cfg } from '../../global-config'
import { assertRange } from '../test-helpers'

const testProjectPath = path.join(__dirname, '../../../src/tests/test-projects/react-i18next')
const codePath = path.join(testProjectPath, 'src/unit-tests')

const reactI18nextFiles = {
  main: fs.readFileSync(path.join(codePath, 'main.tsx'), 'utf8'),
  classComponent: fs.readFileSync(path.join(codePath, 'class-component.tsx'), 'utf8'),
  customDefaultNs: fs.readFileSync(path.join(codePath, 'custom-default-ns.tsx'), 'utf8'),
  hocWithNsArray: fs.readFileSync(path.join(codePath, 'hoc-with-ns-array.tsx'), 'utf8'),
  hocWithNs: fs.readFileSync(path.join(codePath, 'hoc-with-ns.tsx'), 'utf8'),
  nsArray: fs.readFileSync(path.join(codePath, 'ns-array.tsx'), 'utf8'),
  translationRender: fs.readFileSync(path.join(codePath, 'translation-render.tsx'), 'utf8'),
  withDefaultPrefix: fs.readFileSync(path.join(codePath, 'with-default-prefix.tsx'), 'utf8'),
  allContexts: fs.readFileSync(path.join(codePath, 'all-contexts.tsx'), 'utf8'),
}

suite('react-i18next project', function () {
  const defaultConfig = cloneDeep(cfg.settings)

  suiteTeardown(async () => {
    cfg.settings = defaultConfig
  })

  suite('context detection', () => {
    const content = reactI18nextFiles.allContexts

    test('JSX_ELEMENT_CONTENT', () => {
      assertRange(695, 705, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_ELEMENT_CONTENT)
      assertRange(736, 756, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_ELEMENT_CONTENT)
      assertRange(973, 979, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_ELEMENT_CONTENT)
    })

    test('JSX_ATTRIBUTE_VALUE', () => {
      assertRange(688, 693, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_ATTRIBUTE_VALUE)
    })

    test('JSX_EXPRESSION', () => {
      assertRange(574, 574, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
      assertRange(580, 580, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
      assertRange(589, 589, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
      assertRange(594, 594, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
      assertRange(600, 600, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
      assertRange(607, 607, (pos) => detectCursorContextReact(content, pos), CursorContextReact.JSX_EXPRESSION)
    })

    test('TEMPLATE_LITERAL', () => {
      assertRange(471, 483, (pos) => detectCursorContextReact(content, pos), CursorContextReact.TEMPLATE_LITERAL)
      assertRange(575, 579, (pos) => detectCursorContextReact(content, pos), CursorContextReact.TEMPLATE_LITERAL)
      assertRange(928, 946, (pos) => detectCursorContextReact(content, pos), CursorContextReact.TEMPLATE_LITERAL)
    })

    test('STRING_LITERAL', () => {
      assertRange(318, 321, (pos) => detectCursorContextReact(content, pos), CursorContextReact.STRING_LITERAL)
      assertRange(394, 397, (pos) => detectCursorContextReact(content, pos), CursorContextReact.STRING_LITERAL)
      assertRange(494, 498, (pos) => detectCursorContextReact(content, pos), CursorContextReact.STRING_LITERAL)
    })

    // NOTE: OBJECT_PROPERTY and FUNCTION_CALL contexts not detected - doesn't matter in practice

    // default context with t() function without any adjustments
    test('UNKNOWN', () => {
      assertRange(316, 316, (pos) => detectCursorContextReact(content, pos), CursorContextReact.UNKNOWN)
      assertRange(405, 405, (pos) => detectCursorContextReact(content, pos), CursorContextReact.UNKNOWN)
      assertRange(469, 469, (pos) => detectCursorContextReact(content, pos), CursorContextReact.UNKNOWN)
    })
  })
})
