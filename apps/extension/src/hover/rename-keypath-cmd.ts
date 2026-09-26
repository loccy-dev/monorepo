import * as vscode from 'vscode'
import { inputKeypath, KeypathInputType } from '../helpers/input-keypath'
import { usageService } from '../helpers/usage-service'
import { reportEvent } from '../telemetry/telemetry'
import { updateAnnotations } from './annotations'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import type { Namespace } from '@repo/types/primitives.types'
import { resourceService, type KeypathRename } from '../helpers/resource-service'
import { s } from '@repo/shared/core/helpers/helpers'
import { editWorkspaceAndSave } from '../helpers/workspace-edit'

export interface CmdEditKeyArgs {
  keypath: string
  initValue?: string
  namespace?: Namespace
  prefix?: string
}

export async function renameKeypathCmd(context: vscode.ExtensionContext, args: CmdEditKeyArgs) {
  reportEvent(TelemetryEvent.actionsWithTranslations_editKeypath)

  let keypath = args.keypath
  const initValue = args.initValue ?? keypath

  if (!keypath) {
    handleError({ snackbar: 'No keypath provided', internal: 'editKeypathCmd' })
    return
  }

  // the hovered file (active editor) determines which module this keypath belongs to
  const moduleName = resourceService.resolveViewForActiveEditor(keypath, args.namespace)?.name

  if (!(await confirmDynamicUsages([{ keypath, namespace: args.namespace }]))) {
    return
  }

  let newValue = await inputKeypath({
    type: KeypathInputType.Update,
    initValue,
    namespace: args.namespace,
    prefix: args.prefix,
    moduleName,
  })
  if (!newValue) {
    return
  }

  if (newValue === keypath) {
    return
  }

  const success = await applyKeypathRenames([{ from: keypath, to: newValue, namespace: args.namespace, moduleName }])
  if (success) {
    vscode.window.showInformationMessage('Keypath successfully renamed')
    reportEvent(TelemetryEvent.actionsWithTranslations_editKeypath_done)
  }
}

/** Dynamic usages can't be renamed, so the user decides whether renaming static ones alone is fine. */
export async function confirmDynamicUsages(keys: { keypath: string; namespace?: Namespace }[]): Promise<boolean> {
  if (!usageService.initialized) {
    return true
  }

  let dynamicUsages = 0
  for (const { keypath, namespace } of keys) {
    for (const keyInfos of usageService.getPerKeypath(namespace).get(keypath)?.values() ?? []) {
      for (const keyInfo of keyInfos) {
        if (keyInfo.type === 'dynamic-defined') {
          dynamicUsages++
        }
      }
    }
  }

  if (dynamicUsages === 0) {
    return true
  }

  const subject = keys.length === 1 ? 'This key is' : 'These keys are'
  type Choice = vscode.QuickPickItem & { id: 'continue' | 'cancel' }
  const choice = await vscode.window.showQuickPick<Choice>(
    [
      { label: 'Continue', description: 'Rename static usages only', id: 'continue' },
      { label: 'Cancel', id: 'cancel' },
    ],
    {
      placeHolder: `${subject} built dynamically in ${dynamicUsages} place${s(dynamicUsages)}. Dynamic usages won't be renamed. Continue?`,
    },
  )
  return choice?.id === 'continue'
}

/** Rename keypaths in resource files and usages as one atomic workspace edit. */
export async function applyKeypathRenames(renames: KeypathRename[]): Promise<boolean> {
  let cancelled = false
  if (!usageService.initialized) {
    cancelled = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Waiting for usage service initialization...',
        cancellable: true,
      },
      async (_, token) => {
        while (!usageService.initialized && !token.isCancellationRequested) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
        return token.isCancellationRequested
      },
    )
  }
  if (cancelled) {
    return false
  }

  const success = await editWorkspaceAndSave(async (workspaceEdit: vscode.WorkspaceEdit) => {
    for (const { from, to, namespace } of renames) {
      await usageService.collectKeypathRenameChanges(workspaceEdit, from, to, namespace)
    }
    await resourceService.collectRenameChanges(workspaceEdit, renames)
  })

  if (!success) {
    handleError({ snackbar: 'Failed to rename keypath', internal: 'applyKeypathRenames: applyEdit failed' })
    return false
  }

  // update internal state immediately — don't wait for file watchers (keeps annotations responsive)
  for (const { from, to, namespace, moduleName } of renames) {
    await resourceService.renameKeypathInternally(from, to, namespace, moduleName)
  }

  updateAnnotations()
  return true
}
