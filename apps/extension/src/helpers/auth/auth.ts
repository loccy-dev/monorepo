import * as vscode from 'vscode'
import { cfg } from '../../global-config'
import { Logger } from '../logger'
import { handleError } from '../error-handler'
import { LifecycleEvent, reportEvent, reportLifecycleEvent } from '../../telemetry/telemetry'
import { TelemetryEvent } from '../../telemetry/events'

const TOKEN_KEY = 'loccy.authToken'

let secretStorage: vscode.SecretStorage
let currentToken: string | null = null

function isSignedIn(): boolean {
  return currentToken !== null
}

export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  if (currentToken) {
    headers.Authorization = `Bearer ${currentToken}`
  }
  return headers
}

export async function initializeAuth(context: vscode.ExtensionContext): Promise<void> {
  if (secretStorage) {
    Logger.info('Auth already initialized.')
    return
  }

  secretStorage = context.secrets

  try {
    currentToken = (await secretStorage.get(TOKEN_KEY)) ?? null
    Logger.info(`Auth initialized. Signed in: ${isSignedIn()}`)
  } catch (e: any) {
    handleError({ e, snackbar: `Failed to initialize authentication: ${e.message}` })
  }
}

export async function signInWithProgress(): Promise<void> {
  const sessionId = crypto.randomUUID()
  const callbackUrl = `${vscode.env.uriScheme}://loccy.loccy/auth`
  const initiateSignInUrl = `${cfg.webAppDomain}/vscode/auth?sessionId=${sessionId}&callbackUrl=${callbackUrl}`
  vscode.env.openExternal(vscode.Uri.parse(initiateSignInUrl))
}

export async function handleAuthCallbackUri(uri: vscode.Uri) {
  if (uri.authority !== 'loccy.loccy' || uri.path !== '/auth') {
    return
  }

  const params = new URLSearchParams(uri.query)
  const token = params.get('token')

  if (!token) {
    handleError({ snackbar: 'Sign in failed: no token received' })
    return
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Signing in...',
      cancellable: false,
    },
    async () => {
      try {
        await secretStorage.store(TOKEN_KEY, token)
        currentToken = token

        vscode.window.showInformationMessage('Sign in successful')
        reportLifecycleEvent(LifecycleEvent.authorize, {})
        reportEvent(TelemetryEvent.signInWindow_clickSignIn_done)
      } catch (e) {
        reportEvent(TelemetryEvent.signInWindow_clickSignIn_error)
        handleError({ snackbar: 'Sign in failed', e })
      }
    },
  )
}

export async function signOut(): Promise<void> {
  if (!currentToken) {
    vscode.window.showInformationMessage('You are already signed out')
    return
  }

  try {
    await secretStorage.delete(TOKEN_KEY)
    currentToken = null
    vscode.window.showInformationMessage('Successfully logged out')
  } catch (e) {
    handleError({ snackbar: 'Logout failed', e })
  }
}
