import * as vscode from 'vscode'
import { LOCCY_DOCS } from '@repo/shared/core/config'
import { loccyConfigFilename, type LoccyConfig } from '@repo/types/config.types'

const OPEN_DOCS = 'Styleguide docs'

/** Last set reported, so re-resolving on an unrelated edit does not warn again. */
let lastReported: string | null = null

/** Dropped styleguide fields are silent otherwise: the rules read as complete, the copy goes unchecked. */
export function warnDroppedStyleguide(config: LoccyConfig): void {
  const dropped = config.droppedStyleguideFields
  if (!dropped?.length) {
    lastReported = null
    return
  }

  const summary = dropped.map(({ field, reason }) => `${field} (${reason})`).join(', ')
  if (summary === lastReported) {
    return
  }
  lastReported = summary

  void vscode.window
    .showWarningMessage(`${loccyConfigFilename}: styleguide fields ignored, ${summary}`, OPEN_DOCS)
    .then((choice) => {
      if (choice === OPEN_DOCS) {
        void vscode.env.openExternal(vscode.Uri.parse(`${LOCCY_DOCS}/config/styleguide`))
      }
    })
}
