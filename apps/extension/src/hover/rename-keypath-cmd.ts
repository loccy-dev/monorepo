import * as vscode from 'vscode'
import { inputKeypath, KeypathInputType } from '../helpers/input-keypath'
import { usageService } from '../helpers/usage-service'
import { reportEvent } from '../telemetry/telemetry'
import { updateAnnotations } from './annotations'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import type { Namespace } from '@repo/types/primitives.types'
import { resourceService } from '../helpers/resource-service'
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

  if (usageService.initialized) {
    const perKey = usageService.getPerKeypath(args.namespace).get(keypath)
    if (perKey) {
      let dynamicUsages = 0
      for (const keyInfos of perKey.values()) {
        for (const keyInfo of keyInfos) {
          if (keyInfo.type === 'dynamic-defined') {
            dynamicUsages++
          }
        }
      }

      if (dynamicUsages > 0) {
        type Choice = vscode.QuickPickItem & { id: 'continue' | 'cancel' }
        const choice = await vscode.window.showQuickPick<Choice>(
          [
            { label: 'Continue', description: 'Rename static usages only', id: 'continue' },
            { label: 'Cancel', id: 'cancel' },
          ],
          {
            placeHolder: `This key is built dynamically in ${dynamicUsages} place${s(dynamicUsages)}. Dynamic usages won't be renamed. Continue?`,
          },
        )
        if (!choice || choice.id !== 'continue') {
          return
        }
      }
    }
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
    return
  }

  const success = await editWorkspaceAndSave(async (workspaceEdit: vscode.WorkspaceEdit) => {
    await usageService.collectKeypathRenameChanges(workspaceEdit, keypath, newValue, args.namespace)
    await resourceService.collectUpdateKeyChanges(workspaceEdit, keypath, newValue, args.namespace, moduleName)
  })

  if (success) {
    vscode.window.showInformationMessage('Keypath successfully renamed')

    // update internal state immediately — don't wait for file watchers (keeps annotations responsive)
    await resourceService.renameKeypathInternally(keypath, newValue, args.namespace, moduleName)

    updateAnnotations()
    reportEvent(TelemetryEvent.actionsWithTranslations_editKeypath_done)
  } else {
    handleError({ snackbar: 'Failed to rename keypath', internal: 'editKeypathCmd: applyEdit failed' })
  }
}
