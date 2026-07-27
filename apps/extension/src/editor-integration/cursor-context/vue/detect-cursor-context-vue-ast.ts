import { parse as parseSFC, SFCBlock } from '@vue/compiler-sfc'
import {
  parse as parseTemplate,
  Node as VueNode,
  ElementNode,
  RootNode,
  CompoundExpressionNode,
} from '@vue/compiler-dom'
import { CursorContextVue } from './cursor-context-vue.types'

interface NodeMatch {
  node: VueNode
  parent?: VueNode
}

/** Uses the Vue compilers to build an AST, handling offsets relative to the SFC vs. the inner template content. */
export function detectCursorContextVueAst(content: string, cursorOffset: number): CursorContextVue {
  try {
    const { descriptor } = parseSFC(content)

    if (descriptor.scriptSetup && isCursorInsideBlock(cursorOffset, descriptor.scriptSetup)) {
      return CursorContextVue.SCRIPT_SETUP
    }
    if (descriptor.script && isCursorInsideBlock(cursorOffset, descriptor.script)) {
      return CursorContextVue.SCRIPT_OPTIONS
    }

    if (descriptor.template && isCursorInsideBlock(cursorOffset, descriptor.template)) {
      const template = descriptor.template
      const relativeCursorPos = cursorOffset - template.loc.start.offset
      const ast = parseTemplate(template.content, { comments: true })

      const match = findDeepestNodeAndParentAt(ast, relativeCursorPos)

      if (match) {
        const { node, parent } = match

        // expression types are ambiguous alone; disambiguate via parent
        if (node.type === 4 /* SIMPLE_EXPRESSION */ || node.type === 8 /* COMPOUND_EXPRESSION */) {
          if (parent?.type === 5 /* INTERPOLATION */) {
            return CursorContextVue.TEMPLATE_INTERPOLATION
          }
          if (parent?.type === 7 /* DIRECTIVE */) {
            return CursorContextVue.VUE_DIRECTIVE
          }
        }

        // If not a nested expression, handle the container node types directly.
        switch (node.type) {
          case 5: // INTERPOLATION: {{ |cursor| }}
            return CursorContextVue.TEMPLATE_INTERPOLATION
          case 7: // DIRECTIVE: v-if, @click, :prop, #slot
            return CursorContextVue.VUE_DIRECTIVE
          case 6: // ATTRIBUTE: class="...", id="..."
            return CursorContextVue.TEMPLATE_ATTR
          case 1: // ELEMENT: <div ...> or <p>|cursor|</p>
            const elementNode = node as ElementNode
            const openingTagEndOffset = template.content.indexOf('>', elementNode.loc.start.offset)
            // Check if cursor is within the opening tag (e.g., `<div |cursor| class="">`)
            if (openingTagEndOffset !== -1 && relativeCursorPos <= openingTagEndOffset) {
              return CursorContextVue.TEMPLATE_ATTR
            }
            break // Fallthrough to default (TEMPLATE_TAG) for element content
        }
      }

      // Default context for template area (e.g., inside an element's text content).
      return CursorContextVue.TEMPLATE_TAG
    }

    return CursorContextVue.UNKNOWN
  } catch (error) {
    return CursorContextVue.UNKNOWN
  }
}

/** `position` must be relative to the start of the parsed content. */
function findDeepestNodeAndParentAt(root: RootNode, position: number): NodeMatch | undefined {
  let result: NodeMatch | undefined

  function walk(node: VueNode, parent?: VueNode) {
    if (node.loc && position > node.loc.start.offset && position < node.loc.end.offset) {
      result = { node, parent }

      if ('children' in node && Array.isArray(node.children)) {
        ;(node as RootNode | ElementNode | CompoundExpressionNode).children.forEach((child) => {
          if (typeof child !== 'symbol') {
            walk(child as VueNode, node)
          }
        })
      }
      if ('props' in node && Array.isArray(node.props)) {
        ;(node as ElementNode).props.forEach((prop) => walk(prop, node))
      }
      if (node.type === 7 /* DIRECTIVE */) {
        // @ts-expect-error
        if (node.arg) {
          // @ts-expect-error
          walk(node.arg, node)
        }
        // @ts-expect-error
        if (node.exp) {
          // @ts-expect-error
          walk(node.exp, node)
        }
      }
      if (node.type === 5 /* INTERPOLATION */) {
        // @ts-expect-error
        walk(node.content, node)
      }
    }
  }

  walk(root)
  return result
}

function isCursorInsideBlock(cursor: number, block: SFCBlock | null): boolean {
  if (!block) {
    return false
  }
  // block locations from @vue/compiler-sfc are absolute offsets from file start
  return cursor >= block.loc.start.offset && cursor <= block.loc.end.offset
}
