import * as vscode from 'vscode'
import * as path from 'path'

interface Release {
  version: string
  date: string
  file: string
}

export class ReleasesManager {
  private releases: Release[] = []

  constructor(
    private context: vscode.ExtensionContext,
    private extensionId: string,
  ) {}

  async checkForUpdates(): Promise<void> {
    const currentVersion = vscode.extensions.getExtension(this.extensionId)?.packageJSON.version

    if (!currentVersion) {
      console.warn(`Extension ${this.extensionId} not found`)
      return
    }

    const lastSeen = this.context.globalState.get<string>(`${this.extensionId}.lastVersion`)

    // Only show release notes on version updates, not first install
    if (lastSeen && lastSeen !== currentVersion) {
      const release = this.releases.find((r) => r.version === currentVersion)
      if (release) {
        await this.showReleaseNotes(release)
      }
    }

    // always save current
    await this.context.globalState.update(`${this.extensionId}.lastVersion`, currentVersion)
  }

  private async showReleaseNotes(release: Release): Promise<void> {
    const filePath = vscode.Uri.file(path.join(this.context.extensionPath, release.file))

    try {
      await vscode.commands.executeCommand('markdown.showPreview', filePath)
    } catch (error) {
      vscode.window.showErrorMessage(`Release notes not found: ${release.file}`)
    }
  }
}
