import * as vscode from 'vscode'
import { handleError, handleErrorDebounced } from './error-handler'
import { getResourceFormatByExt } from '@repo/shared/core/registry'
import { Gitignore } from '@repo/shared/core/files/gitignore'
import { matchesGlobs } from '@repo/shared/core/files/module-globs'
import { loccyConfigGlob } from '@repo/types/config.types'
import { DEFAULT_IGNORE_GLOBS } from '@repo/types/platform.types'
import { createVscodePlatform, findFilesUnder, getLoccyRoot, toRootRelative } from './vscode-platform'

export enum FileType {
  Resource = 'Resource',
  Source = 'Source',
}

class FileResolver {
  translationFileUris: vscode.Uri[] = []
  srcFileUris: vscode.Uri[] = []

  private translationIncludePaths: string[] = []
  private translationExcludePaths: string[] = []
  private usagesIncludePaths: string[] = []
  private usagesExcludePaths: string[] = []
  /** Sources only: a generated, gitignored resource file is still ours to manage. */
  private gitignore = Gitignore.empty()

  async init(
    translationIncludePaths: string[],
    translationExcludePaths: string[],
    usagesIncludePaths: string[],
    usagesExcludePaths: string[],
  ) {
    this.translationIncludePaths = translationIncludePaths
    this.translationExcludePaths = translationExcludePaths
    this.usagesIncludePaths = usagesIncludePaths
    this.usagesExcludePaths = usagesExcludePaths
    this.gitignore = await this.loadGitignore()

    this.translationFileUris = await this.getResourceFileUris()
    this.srcFileUris = await this.getSrcFileUris()
  }

  async getFileUris(include: string[], exclude: string[] = []) {
    if (!include.length) {
      return []
    }

    const root = await getLoccyRoot()
    if (!root) {
      return []
    }

    return findFilesUnder(root, include, exclude)
  }

  async readFile(uri: vscode.Uri) {
    try {
      // currently opened file
      const activeDocument = vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString())
      if (activeDocument) {
        // could be dirty (unsaved)
        return activeDocument.getText()
      }

      // closed file
      const bytes = await vscode.workspace.fs.readFile(uri)
      return new TextDecoder('utf-8').decode(bytes)
    } catch (e: any) {
      if (e.message === 'Canceled') {
        return
      }
      handleErrorDebounced({ internal: `Error reading a file: ${vscode.workspace.asRelativePath(uri)}`, e })
    }
  }

  private async getResourceFileUris() {
    try {
      const uris = await this.getFileUris(this.translationIncludePaths, [
        ...this.translationExcludePaths,
        loccyConfigGlob,
      ])
      const filteredUris: vscode.Uri[] = []
      for (const uri of uris) {
        try {
          // keep files whose extension has a registered resource format (json, yaml, php, …)
          const ext = uri.path.split('.').pop() ?? ''
          if (getResourceFormatByExt(ext)) {
            filteredUris.push(uri)
          }
        } catch (e) {
          handleError({
            internal: `getResourcePaths: skipping file '${uri.toString()}' due to error`,
            e,
          })
        }
      }

      return filteredUris
    } catch (e) {
      handleError({
        internal: 'getResourcePaths: failed to find resource files',
        e,
      })
      return []
    }
  }

  private async getSrcFileUris() {
    try {
      const uris = await this.getFileUris(this.usagesIncludePaths, [...this.usagesExcludePaths, loccyConfigGlob])
      return uris.filter((uri) => {
        const relativePath = toRootRelative(uri)
        return relativePath !== null && !this.gitignore.isIgnored(relativePath)
      })
    } catch (e) {
      handleError({
        internal: 'getResourcePaths: failed to find resource files',
        e,
      })
      return []
    }
  }

  private async loadGitignore() {
    try {
      const platform = await createVscodePlatform()
      return platform ? await Gitignore.load(platform) : Gitignore.empty()
    } catch (e) {
      handleError({ internal: 'loadGitignore: failed to read .gitignore files', e })
      return Gitignore.empty()
    }
  }

  checkFileType(uri: vscode.Uri): FileType | undefined {
    // First check cached paths
    if (this.translationFileUris.find((u) => u.toString() === uri.toString())) {
      return FileType.Resource
    }

    if (this.srcFileUris.find((u) => u.toString() === uri.toString())) {
      return FileType.Source
    }

    const relativePath = toRootRelative(uri)
    if (!relativePath) {
      return
    }

    if (this.matchesResourcePattern(relativePath)) {
      return FileType.Resource
    }

    if (this.matchesSourcePattern(relativePath)) {
      return FileType.Source
    }

    return undefined
  }

  shouldTrackFile(uri: vscode.Uri, type: FileType): boolean {
    const relativePath = toRootRelative(uri)
    if (!relativePath) {
      return false
    }

    if (type === FileType.Resource) {
      return this.matchesResourcePattern(relativePath)
    } else if (type === FileType.Source) {
      return this.matchesSourcePattern(relativePath)
    }

    return false
  }

  private matchesResourcePattern(relativePath: string): boolean {
    const exclude = [...this.translationExcludePaths, loccyConfigGlob, ...DEFAULT_IGNORE_GLOBS]
    return matchesGlobs(relativePath, this.translationIncludePaths, exclude)
  }

  private matchesSourcePattern(relativePath: string): boolean {
    if (this.gitignore.isIgnored(relativePath)) {
      return false
    }
    const exclude = [...this.usagesExcludePaths, loccyConfigGlob, ...DEFAULT_IGNORE_GLOBS]
    return matchesGlobs(relativePath, this.usagesIncludePaths, exclude)
  }

  public handleFileDelete(uri: vscode.Uri) {
    this.translationFileUris = this.translationFileUris.filter((p) => p.toString() !== uri.toString())
    this.srcFileUris = this.srcFileUris.filter((p) => p.toString() !== uri.toString())
  }

  async addResourceFile(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString()
    if (this.translationFileUris.find((u) => u.toString() === uriString)) {
      return
    }
    if (this.shouldTrackFile(uri, FileType.Resource)) {
      this.translationFileUris.push(uri)
    }
  }

  async removeResourceFile(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString()
    this.translationFileUris = this.translationFileUris.filter((u) => u.toString() !== uriString)
  }

  async addSourceFile(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString()
    if (this.srcFileUris.find((u) => u.toString() === uriString)) {
      return
    }
    if (this.shouldTrackFile(uri, FileType.Source)) {
      this.srcFileUris.push(uri)
    }
  }

  async removeSourceFile(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString()
    this.srcFileUris = this.srcFileUris.filter((u) => u.toString() !== uriString)
  }
}

export const fileResolver = new FileResolver()
