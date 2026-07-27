import crypto from 'crypto'
import * as vscode from 'vscode'
import { extensionContext } from '../extension'
import { TelemetryEvent } from './events'
import { cfg } from '../global-config'
import { getAuthHeaders } from '../helpers/auth/auth'
import { handleError } from '../helpers/error-handler'

export enum LifecycleEvent {
  install = 'install',
  tryAi = 'tryAi', // attempt before auth
  authorize = 'authorize',
}

function getUniqueId() {
  // could be undefined or constant value
  const machineId = vscode.env.machineId

  const pattern = /^[0-9a-f]{64}$/
  if (machineId && pattern.test(machineId)) {
    return `mid_${machineId}`
  } else {
    const installDate = getInstallationDate(extensionContext)
    if (!installDate) {
      return null
    }

    const hash = crypto.createHash('sha256')
    hash.update(installDate.toISOString())
    return `dat_${hash.digest('hex')}`
  }
}

export async function reportLifecycleEvent(
  event: LifecycleEvent,
  customProps: Record<string, string | boolean | number | undefined> = {},
) {
  if (!vscode.env.isTelemetryEnabled) {
    return
  }

  const installId = getUniqueId()
  if (!installId) {
    handleError({ internal: 'Failed to get uniqueId' })
    return
  }

  try {
    // 'authorize' needs a server-verified user id, so the bearer token rides along — the server
    // trusts the token, never a client-supplied user id.
    const authHeaders = event === LifecycleEvent.authorize ? getAuthHeaders() : {}

    await fetch(`${cfg.webAppDomain}/api/web/telemetry/extension-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        installId,
        event,
        extVersion: vscode.extensions.getExtension('loccy.loccy')?.packageJSON.version,
        ...customProps,
      }),
    })
  } catch {
    // best-effort telemetry — swallow network errors
  }
}

// INSTALL DATE

const INSTALLATION_DATE_KEY = 'installationDate'

export function setInstallationDate(context: vscode.ExtensionContext) {
  let installationDate = context.globalState.get<string>(INSTALLATION_DATE_KEY)
  if (!installationDate) {
    // First time activation - store current date
    installationDate = new Date().toISOString()
    context.globalState.update(INSTALLATION_DATE_KEY, installationDate)
  }
}

export function getInstallationDate(context: vscode.ExtensionContext) {
  const dateString = context.globalState.get<string>(INSTALLATION_DATE_KEY)
  return dateString ? new Date(dateString) : null
}

// GENERAL

export async function reportEvent(
  event: TelemetryEvent,
  options?: Record<string, string>,
  measurements?: Record<string, number>,
) {
  const finalOptions: Record<string, string> = {
    uriScheme: vscode.env.uriScheme,
    installationDate: getInstallationDate(extensionContext)?.toISOString() ?? 'empty',
    ...options,
  }

  if (process.env.LOCCY_DEBUG) {
    console.log('//sendTelemetryEvent', event, finalOptions, measurements ?? '')
  }
}

export async function reportError(props: Record<string, string | undefined>) {
  if (process.env.LOCCY_DEBUG) {
    console.error('//reportError', props)
  }
}
