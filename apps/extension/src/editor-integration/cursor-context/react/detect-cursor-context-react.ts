// @ts-nocheck

import { parse } from '@babel/parser'
import traverse from '@babel/traverse'
import { CursorContextReact } from './cursor-context-react.types'

export function detectCursorContextReact(content: string, cursorOffset: number): CursorContextReact {
  try {
    const ast = parse(content, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      ranges: true,
    })

    const path = findPathAtPosition(ast, cursorOffset)
    if (!path) {
      return CursorContextReact.UNKNOWN
    }

    return analyzeNodeContext(path, cursorOffset)
  } catch (error) {
    // Fallback to parsing without TypeScript if fails
    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: ['jsx'],
        ranges: true,
      })

      const path = findPathAtPosition(ast, cursorOffset)
      if (!path) {
        return CursorContextReact.UNKNOWN
      }

      return analyzeNodeContext(path, cursorOffset)
    } catch (jsError) {
      return CursorContextReact.UNKNOWN
    }
  }
}

interface BabelNode {
  type: string
  start: number
  end: number
  [key: string]: any
}

interface BabelPath {
  node: BabelNode
  parent: BabelNode
  parentPath: BabelPath | null
}

function findPathAtPosition(ast: any, position: number): BabelPath | null {
  let deepestPath: BabelPath | null = null
  let minRange = Infinity

  traverse(ast, {
    enter(path) {
      const node = path.node
      if (node.start !== undefined && node.end !== undefined && node.start <= position && position <= node.end) {
        const range = node.end - node.start
        if (range < minRange) {
          minRange = range
          deepestPath = path as unknown as BabelPath
        }
      }
    },
  })

  return deepestPath
}

function analyzeNodeContext(path: BabelPath, cursorOffset: number): CursorContextReact {
  let current: BabelPath | null = path

  while (current) {
    const node = current.node

    switch (node.type) {
      case 'JSXText':
        const text = node.value || ''
        const trimmed = text.trim()
        if (trimmed.length > 0) {
          return CursorContextReact.JSX_ELEMENT_CONTENT
        }
        break

      case 'JSXElement':
      case 'JSXFragment':
        // Check if cursor is in the opening tag, closing tag, or content area
        if (
          node.openingElement &&
          cursorOffset >= node.openingElement.start &&
          cursorOffset <= node.openingElement.end
        ) {
          if (node.openingElement.attributes) {
            for (const attr of node.openingElement.attributes) {
              if (cursorOffset >= attr.start && cursorOffset <= attr.end) {
                return analyzeNodeContext(
                  {
                    node: attr,
                    parent: node.openingElement,
                    parentPath: current,
                  } as BabelPath,
                  cursorOffset,
                )
              }
            }
          }
          // We're in the tag name or between attributes
          return CursorContextReact.JSX_ELEMENT_CONTENT
        } else if (
          node.closingElement &&
          cursorOffset >= node.closingElement.start &&
          cursorOffset <= node.closingElement.end
        ) {
          return CursorContextReact.JSX_ELEMENT_CONTENT
        } else if (node.children && node.children.length > 0) {
          if (
            cursorOffset > (node.openingElement?.end || node.start) &&
            cursorOffset < (node.closingElement?.start || node.end)
          ) {
            return CursorContextReact.JSX_ELEMENT_CONTENT
          }
        }
        break

      case 'JSXAttribute':
        if (node.value && cursorOffset >= node.value.start && cursorOffset <= node.value.end) {
          if (node.value.type === 'JSXExpressionContainer') {
            return CursorContextReact.JSX_EXPRESSION
          } else if (node.value.type === 'StringLiteral') {
            return CursorContextReact.JSX_ATTRIBUTE_VALUE
          }
        }
        // If we're in the attribute name area
        return CursorContextReact.JSX_ATTRIBUTE_VALUE

      case 'JSXExpressionContainer':
        if (node.expression && cursorOffset >= node.expression.start && cursorOffset <= node.expression.end) {
          return analyzeNodeContext(
            {
              node: node.expression,
              parent: node,
              parentPath: current,
            } as BabelPath,
            cursorOffset,
          )
        }
        return CursorContextReact.JSX_EXPRESSION

      case 'StringLiteral':
        if (isInsideJsxContext(current)) {
          if (current.parent && current.parent.type === 'JSXAttribute') {
            return CursorContextReact.JSX_ATTRIBUTE_VALUE
          }
          // cursor on the string's quotes → treat as the JSX expression, not the literal
          if (cursorOffset === node.start || cursorOffset === node.end) {
            return CursorContextReact.JSX_EXPRESSION
          }
          return CursorContextReact.STRING_LITERAL
        }
        return CursorContextReact.STRING_LITERAL

      case 'TemplateLiteral':
        if (isInsideJsxContext(current)) {
          // cursor on the backticks → treat as the JSX expression, not the literal
          if (cursorOffset === node.start || cursorOffset === node.end) {
            return CursorContextReact.JSX_EXPRESSION
          }
          return CursorContextReact.TEMPLATE_LITERAL
        }
        return CursorContextReact.TEMPLATE_LITERAL

      case 'ObjectProperty':
        if (node.value && cursorOffset >= node.value.start && cursorOffset <= node.value.end) {
          return CursorContextReact.OBJECT_PROPERTY
        }
        break

      case 'CallExpression':
        return CursorContextReact.FUNCTION_CALL
    }

    current = current.parentPath
  }

  return CursorContextReact.UNKNOWN
}

function isInsideJsxContext(path: BabelPath): boolean {
  let current: BabelPath | null = path.parentPath

  while (current) {
    const type = current.node.type
    if (
      type === 'JSXElement' ||
      type === 'JSXFragment' ||
      type === 'JSXAttribute' ||
      type === 'JSXExpressionContainer'
    ) {
      return true
    }
    current = current.parentPath
  }

  return false
}
