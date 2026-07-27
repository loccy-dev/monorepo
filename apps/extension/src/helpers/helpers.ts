import * as vscode from 'vscode'
import { cloneDeep } from 'lodash'
import type { LocalizedText } from '@repo/types/primitives.types'
import { fileResolver } from './file-resolver'
import { resourceService } from './resource-service'
import { createVscodePlatform } from './vscode-platform'
import { detectTranslationsLocation } from '@repo/shared/core/loccy-config/defaults-detection/detect-translations-location'

export const NON_BREAKING_SPACE = ' '

export async function getWorkspaceFolder(): Promise<vscode.WorkspaceFolder | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders
  if (!workspaceFolders?.length) {
    return null
  }
  if (workspaceFolders.length === 1) {
    return workspaceFolders[0]
  }

  // multi-root, try to identify the Loccy's one
  // 1st try - search for loccy config
  for (const folder of workspaceFolders) {
    const existingConfigs = await fileResolver.getFileUris([`**/loccy.{yaml,config.json}`])
    const firstConfigUri = existingConfigs[0]
    if (firstConfigUri) {
      return folder
    }
  }

  // 2nd try - i18n setup
  for (const folder of workspaceFolders) {
    const platform = createVscodePlatform()
    const candidates = platform ? await detectTranslationsLocation(platform) : []
    if (candidates.length) {
      return folder
    }
  }

  // 3d - just return first
  return workspaceFolders[0]
}

function stringifyAndClean(obj: object, removeBrackets = false, removeSemicolons = false) {
  const allLocales = resourceService.allLocales
  obj = Object.fromEntries(Object.entries(obj).sort((a, b) => allLocales.indexOf(a[0]) - allLocales.indexOf(b[0])))

  const stringified = JSON.stringify(obj)
  let cleaned = stringified
    .replaceAll('{"', '{')
    .replaceAll(',"', ', ')
    .replaceAll('":', removeSemicolons ? ' ' : ': ')
  if (removeBrackets) {
    cleaned = cleaned.slice(1, -1)
  }
  return cleaned
}

export function localizedTextDotJoined(localizedText: LocalizedText) {
  const sortedObj = sortLocalizedText(localizedText)
  return stringifyAndClean(sortedObj, true, true).replaceAll(', ', ' • ')
}

// use case: get existing keypath examples close to current line from both sides
export function getLimitedItemsCloseToPisition<T extends { index: number }>(
  arr: T[],
  index: number,
  maxItems: number,
): T[] {
  if (!arr.length) {
    return []
  }

  let result: T[] = []
  let middleIndex = 0
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].index <= index && arr[i - 1].index <= index) {
      middleIndex++
    } else {
      break
    }
  }

  let diff = 0
  while (result.length < maxItems) {
    const left = arr[middleIndex - diff]
    const right = arr[middleIndex + diff + 1]
    if (left) {
      result.unshift(left)
    }
    if (right && result.length < maxItems) {
      result.push(right)
    }
    diff++
    if (!left && !right) {
      break
    }
  }

  return result
}

// use-case: get high-level keys organization structure for new keypath creation (for LLM context)
export function getLimitedObjectStructure(obj: any, charsLimit: number): string | null {
  if (!obj) {
    return null
  }

  function stringifyCompact(object: any) {
    return JSON.stringify(object).replaceAll('"', '')
  }

  let prevObj: any = {}
  let currObj: any = {}

  for (const k in obj) {
    if (typeof obj[k] === 'object') {
      currObj[k] = {}
    }
  }
  if (stringifyCompact(currObj).length >= charsLimit) {
    return null
  }
  prevObj = cloneDeep(currObj)

  // level 2
  for (const k in obj) {
    if (typeof obj[k] !== 'object') {
      continue
    }
    for (const kk in obj[k]) {
      if (typeof obj[k][kk] === 'object') {
        currObj[k][kk] = {}
      }
    }
  }
  if (stringifyCompact(currObj).length >= charsLimit) {
    return stringifyCompact(prevObj)
  }
  prevObj = cloneDeep(currObj)

  // level 3
  for (const k in obj) {
    if (typeof obj[k] !== 'object') {
      continue
    }
    for (const kk in obj[k]) {
      if (typeof obj[k][kk] !== 'object') {
        continue
      }
      for (const kkk in obj[k][kk]) {
        if (typeof obj[k][kk][kkk] === 'object') {
          currObj[k][kk][kkk] = {}
        }
      }
    }
  }
  if (stringifyCompact(currObj).length >= charsLimit) {
    return stringifyCompact(prevObj)
  }
  return stringifyCompact(currObj)
}

export function sortLocalizedText(localizedText: LocalizedText, removeEmpty = true) {
  return Object.fromEntries(
    Object.entries(localizedText)
      .sort((a, b) => resourceService.allLocales.indexOf(a[0]) - resourceService.allLocales.indexOf(b[0]))
      .filter(([k, v]) => !removeEmpty || !!v),
  )
}

export async function getSurroundingCode(
  uri: vscode.Uri,
  lineIndex: number,
  charsCount = 1000,
  insertionAtCursorPos?: { col: number; content: string },
) {
  const fileContent = await fileResolver.readFile(uri)
  if (!fileContent) {
    return
  }

  const lines = fileContent.split('\n')

  let targetLineContent = lines[lineIndex]
  if (insertionAtCursorPos) {
    const left = targetLineContent.slice(0, insertionAtCursorPos.col)
    const right = targetLineContent.slice(insertionAtCursorPos.col)
    targetLineContent = `${left}${insertionAtCursorPos.content}${right}`
  }

  let beforeContent = ''
  let afterContent = ''

  // Collect lines before the target line (up to charsCount characters)
  for (let i = lineIndex - 1; i >= 0; i--) {
    const lineWithNewline = lines[i] + '\n'
    if (beforeContent.length + lineWithNewline.length <= charsCount) {
      beforeContent = lineWithNewline + beforeContent
    } else {
      const remainingChars = charsCount - beforeContent.length
      if (remainingChars > 0) {
        beforeContent = lineWithNewline.slice(-remainingChars) + beforeContent
      }
      break
    }
  }

  // Collect lines after the target line (up to charsCount characters)
  for (let i = lineIndex + 1; i < lines.length; i++) {
    const lineWithNewline = lines[i] + '\n'
    if (afterContent.length + lineWithNewline.length <= charsCount) {
      afterContent += lineWithNewline
    } else {
      const remainingChars = charsCount - afterContent.length
      if (remainingChars > 0) {
        afterContent += lineWithNewline.slice(0, remainingChars)
      }
      break
    }
  }

  const result = beforeContent + targetLineContent + '\n' + afterContent

  return result.trim() || undefined
}

/**
 * Checks if a language code matches a locale, either exactly or by the locale's language part.
 * E.g. localeMatchesLanguage("en-CH", "en") // true, localeMatchesLanguage("en-CH", "de") // false
 */
export function localeMatchesLanguage(locale: string, languageCode: string): boolean {
  // normalize for case-insensitive comparison
  const normalizedLanguage = languageCode.toLowerCase().trim()
  const normalizedLocale = locale.toLowerCase().trim()

  if (normalizedLanguage === normalizedLocale) {
    return true
  }

  // Extract language part from locale (supports both '-' and '_' separators)
  const localeLanguagePart = normalizedLocale.split(/[-_]/)[0]

  return normalizedLanguage === localeLanguagePart
}
