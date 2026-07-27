import { CursorContextVue } from './cursor-context-vue.types'

export function detectCursorContextVueManual(content: string, offset: number): CursorContextVue {
  const sections = findTopLevelSections(content)

  const currentSection = sections.find((section) => offset >= section.contentStart && offset <= section.contentEnd)

  if (!currentSection) {
    return CursorContextVue.UNKNOWN
  }

  switch (currentSection.type) {
    case 'template':
      if (isInsideVueDirective(content, offset)) {
        return CursorContextVue.VUE_DIRECTIVE
      }

      if (isInsideInterpolation(content, offset)) {
        return CursorContextVue.TEMPLATE_INTERPOLATION
      }

      if (isInsideHtmlTag(content, offset)) {
        return CursorContextVue.TEMPLATE_ATTR
      }

      return CursorContextVue.TEMPLATE_TAG

    case 'script':
      return currentSection.isSetup ? CursorContextVue.SCRIPT_SETUP : CursorContextVue.SCRIPT_OPTIONS

    default:
      return CursorContextVue.UNKNOWN
  }
}

interface Section {
  type: 'template' | 'script' | 'style'
  tagStart: number
  tagEnd: number
  contentStart: number
  contentEnd: number
  isSetup?: boolean
}

function findTopLevelSections(content: string): Section[] {
  const sections: Section[] = []
  const sectionRegex = /<(template|script|style)([^>]*)>/gi
  let match

  while ((match = sectionRegex.exec(content)) !== null) {
    const tagName = match[1].toLowerCase() as 'template' | 'script' | 'style'
    const attributes = match[2]
    const tagStart = match.index
    const tagEnd = match.index + match[0].length

    if (!isInsideTopLevelTemplate(content, tagStart, sections)) {
      const closingTag = `</${tagName}>`
      const contentStart = tagEnd
      const closingTagIndex = findMatchingClosingTag(content, tagName, tagEnd)

      if (closingTagIndex !== -1) {
        const contentEnd = closingTagIndex
        const isSetup = tagName === 'script' && attributes.includes('setup')

        sections.push({
          type: tagName,
          tagStart,
          tagEnd,
          contentStart,
          contentEnd,
          isSetup,
        })
      }
    }
  }

  return sections
}

function isInsideTopLevelTemplate(content: string, position: number, existingSections: Section[]): boolean {
  const templateSection = existingSections.find(
    (section) => section.type === 'template' && position > section.contentStart && position < section.contentEnd,
  )

  return templateSection !== undefined
}

function findMatchingClosingTag(content: string, tagName: string, startFrom: number): number {
  const openTag = `<${tagName}`
  const closeTag = `</${tagName}>`
  let depth = 1
  let position = startFrom

  while (position < content.length && depth > 0) {
    const nextOpen = content.indexOf(openTag, position)
    const nextClose = content.indexOf(closeTag, position)

    if (nextClose === -1) {
      return -1 // No matching closing tag found
    }

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Found another opening tag before the closing tag
      depth++
      position = nextOpen + openTag.length
    } else {
      // Found a closing tag
      depth--
      if (depth === 0) {
        return nextClose
      }
      position = nextClose + closeTag.length
    }
  }

  return -1
}

function isInsideHtmlTag(content: string, cursorPos: number): boolean {
  const beforeCursor = content.substring(0, cursorPos)
  const afterCursor = content.substring(cursorPos)

  const lastTagOpen = beforeCursor.lastIndexOf('<')
  const lastTagClose = beforeCursor.lastIndexOf('>')

  if (lastTagOpen === -1 || lastTagClose > lastTagOpen) {
    return false
  }

  const nextTagClose = afterCursor.indexOf('>')
  if (nextTagClose === -1) {
    return false
  }

  return true
}

function isInsideVueDirective(content: string, cursorPos: number): boolean {
  if (!isInsideHtmlTag(content, cursorPos)) {
    return false
  }

  const beforeCursor = content.substring(0, cursorPos)
  const afterCursor = content.substring(cursorPos)

  const lastTagOpen = beforeCursor.lastIndexOf('<')

  const nextTagClose = afterCursor.indexOf('>')
  if (nextTagClose === -1) {
    return false
  }

  const tagContent = content.substring(lastTagOpen, cursorPos)

  const quoteInfo = findQuoteContext(tagContent, tagContent.length)
  if (!quoteInfo.isInsideQuotes) {
    return false
  }

  const attributeStart = quoteInfo.attributeStart
  const attributeContent = tagContent.substring(attributeStart, quoteInfo.quoteStart).trim()

  return isVueDirectiveAttribute(attributeContent)
}

interface QuoteContext {
  isInsideQuotes: boolean
  quoteStart: number
  attributeStart: number
  quoteChar: string
}

function findQuoteContext(content: string, position: number): QuoteContext {
  let insideQuotes = false
  let quoteStart = -1
  let attributeStart = -1
  let quoteChar = ''

  for (let i = position - 1; i >= 0; i--) {
    const char = content[i]

    if ((char === '"' || char === "'") && !insideQuotes) {
      insideQuotes = true
      quoteStart = i
      quoteChar = char

      // Find the attribute name before this quote
      for (let j = i - 1; j >= 0; j--) {
        if (content[j] === '=' && attributeStart === -1) {
          // Found the equals sign, now find the attribute name start
          for (let k = j - 1; k >= 0; k--) {
            if (/\s/.test(content[k]) || content[k] === '<') {
              attributeStart = k + 1
              break
            }
          }
          break
        }
      }
      break
    }
  }

  return {
    isInsideQuotes: insideQuotes,
    quoteStart,
    attributeStart,
    quoteChar,
  }
}

function isVueDirectiveAttribute(attributeName: string): boolean {
  const trimmed = attributeName.trim()

  return (
    trimmed.startsWith('v-') || // v-model, v-if, v-tippy, etc.
    trimmed.startsWith(':') || // :label, :class, etc. (shorthand for v-bind)
    trimmed.startsWith('@') || // @click, @input, etc. (shorthand for v-on)
    trimmed.startsWith('#') // #slot (shorthand for v-slot)
  )
}

function isInsideInterpolation(content: string, cursorPos: number): boolean {
  const contentBefore = content.substring(0, cursorPos)
  const contentAfter = content.substring(cursorPos)

  const lastOpenBrace = contentBefore.lastIndexOf('{{')
  const lastCloseBrace = contentBefore.lastIndexOf('}}')

  if (lastOpenBrace === -1) {
    return false
  }

  // a closing brace after the last opening one means that interpolation already ended
  if (lastCloseBrace > lastOpenBrace) {
    return false
  }

  const nextCloseBrace = contentAfter.indexOf('}}')

  return nextCloseBrace !== -1
}
