import * as vscode from 'vscode'
import type { KeypathInfo } from '@repo/types/framework.types'
import { resolveKeypathAtCursor } from '../helpers/keypath-at-cursor'
import { resourceService } from '../helpers/resource-service'
import { renameKeypathCmd } from '../hover/rename-keypath-cmd'
import { editAsJsonCmd } from '../hover/edit-as-json-cmd'
import { editTranslationCmd } from '../hover/edit-translation-cmd'

const EDIT_ALL_AS_JSON = 'Edit all translations manually'

export async function renameKeypathAtCursorCmd(context: vscode.ExtensionContext) {
  const target = await resolveTarget()
  if (!target) {
    return
  }

  renameKeypathCmd(context, {
    keypath: target.keypath,
    initValue: target.keypath,
    namespace: target.keypathInfo.ns,
    prefix: target.keypathInfo.prefix,
  })
}

export async function editTranslationAtCursorCmd(context: vscode.ExtensionContext) {
  const target = await resolveTarget()
  if (!target) {
    return
  }

  const { keypath, keypathInfo } = target
  const namespace = keypathInfo.ns
  const view = resourceService.resolveViewForActiveEditor(keypath, namespace)
  const locales = view?.allLocales ?? resourceService.allLocales
  const translations = resourceService.getFlatTranslationsPerKeypath(namespace, view?.name)[keypath] ?? {}

  const picked = await vscode.window.showQuickPick(
    [
      { label: EDIT_ALL_AS_JSON },
      { label: 'Locales', kind: vscode.QuickPickItemKind.Separator },
      ...locales.map((locale) => ({ label: locale, description: translations[locale] || 'empty' })),
    ],
    { title: `Edit '${keypath}'`, placeHolder: 'Select what to edit' },
  )

  if (!picked) {
    return
  }

  if (picked.label === EDIT_ALL_AS_JSON) {
    editAsJsonCmd(context, keypath, namespace, view?.name)
    return
  }

  editTranslationCmd({ keypath, locale: picked.label, loc: keypathInfo.loc, namespace })
}

/** A dynamic key covers several keypaths, so which one to act on is the user's call. */
async function resolveTarget(): Promise<{ keypathInfo: KeypathInfo; keypath: string } | undefined> {
  const keypathInfo = await resolveKeypathAtCursor()

  if (!keypathInfo) {
    vscode.window.showWarningMessage('No translation key at the cursor')
    return undefined
  }

  if (keypathInfo.keypaths.length <= 1) {
    return { keypathInfo, keypath: keypathInfo.keypaths[0] ?? keypathInfo.content }
  }

  const keypath = await vscode.window.showQuickPick(keypathInfo.keypaths, {
    title: 'Select keypath',
    placeHolder: 'This key is built dynamically',
  })

  return keypath ? { keypathInfo, keypath } : undefined
}
