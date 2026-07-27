import { generateLoccyConfigYaml } from '../settings/generate-loccy-config-yaml'
import { loccyConfigFilename } from '@repo/types/config.types'
import * as vscode from 'vscode'
import { handleError } from '../helpers/error-handler'
import { fileResolver } from '../helpers/file-resolver'
import { reportEvent } from '../telemetry/telemetry'
import { TelemetryEvent } from '../telemetry/events'
import { getWorkspaceFolder } from '../helpers/helpers'

export async function createConfigFileCmd() {
  reportEvent(TelemetryEvent.createConfigFile)

  const wsFolder = await getWorkspaceFolder()
  if (!wsFolder) {
    vscode.window.showErrorMessage("Workspace doesn't have any folders yet")
    return
  }

  const defaultConfigUri = vscode.Uri.joinPath(wsFolder.uri, loccyConfigFilename)

  try {
    const existingConfigs = await fileResolver.getFileUris([`**/${loccyConfigFilename}`])
    let targetConfigUri: vscode.Uri

    if (existingConfigs.length > 0) {
      const existingConfigUri = existingConfigs[0]
      const relativePath = vscode.workspace.asRelativePath(existingConfigUri)

      const overwrite = await vscode.window.showWarningMessage(
        `Configuration file already exists at: ${relativePath}. Do you want to overwrite it?`,
        { modal: true },
        'Overwrite',
      )

      if (overwrite !== 'Overwrite') {
        return
      }

      targetConfigUri = existingConfigUri
    } else {
      targetConfigUri = defaultConfigUri
    }

    const content = generateLoccyConfigYaml()
    await vscode.workspace.fs.writeFile(targetConfigUri, new TextEncoder().encode(content))

    const action = existingConfigs.length > 0 ? 'updated' : 'created'
    vscode.window.showInformationMessage(`Configuration file ${action} successfully`)

    const document = await vscode.workspace.openTextDocument(targetConfigUri)
    await vscode.window.showTextDocument(document)
  } catch (error) {
    handleError({
      e: error,
      internal: `Failed to create config file at ${defaultConfigUri}`,
      snackbar: 'Failed to create configuration file. Please try again.',
    })
  }
}
