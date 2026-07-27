import * as vscode from 'vscode'
import { fileResolver } from '../helpers/file-resolver'
import { loccyConfigFilename } from '@repo/types/config.types'
import { createConfigFileCmd } from './create-config-file-cmd'

/**
 * Open `loccy.yaml` for editing (e.g. from the "No usages configured" hover). Creates one
 * via the standard flow when none exists yet.
 */
export async function openConfigCmd() {
  const [configUri] = await fileResolver.getFileUris([`**/${loccyConfigFilename}`])
  if (configUri) {
    await vscode.window.showTextDocument(configUri)
    return
  }
  await createConfigFileCmd()
}
