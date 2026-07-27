import * as vscode from 'vscode'
import { signInWithProgress } from '../helpers/auth/auth'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import { reportLifecycleEvent, LifecycleEvent, reportEvent } from '../telemetry/telemetry'
import { cfg } from '../global-config'

export async function handleAiApiError(error: any) {
  if (error?.status === 401) {
    reportLifecycleEvent(LifecycleEvent.tryAi)
    reportEvent(TelemetryEvent.signInWindow_show)
    const choice = await vscode.window.showInformationMessage(
      'Please sign in to access this command',
      'Sign In',
      'Cancel',
    )
    if (choice === 'Sign In') {
      reportEvent(TelemetryEvent.signInWindow_clickSignIn)
      await signInWithProgress()
    } else {
      reportEvent(TelemetryEvent.signInWindow_clickCancel)
    }
    return null
  }
  if (error?.status === 402) {
    const choice = await vscode.window.showWarningMessage(
      'Your trial is over, please subscribe to continue.',
      'Manage subscription',
    )
    if (choice === 'Manage subscription') {
      vscode.env.openExternal(vscode.Uri.parse(`${cfg.webAppDomain}/app/home`))
    }
    return null
  }
  handleError({ snackbar: error?.message, internal: 'handleAiApiError', e: error })
}
