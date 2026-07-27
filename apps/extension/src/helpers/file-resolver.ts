import * as vscode from 'vscode'
import { handleError, handleErrorDebounced } from './error-handler'
import { gitignoreHelper } from './gitignore-helper'
import { minimatch } from 'minimatch'
import { getResourceFormatByExt } from '@repo/shared/core/registry'

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

    this.translationFileUris = await this.getResourceFileUris()
    this.srcFileUris = await this.getSrcFileUris()
  }

  async getFileUris(include: string[], exclude: string[] = []) {
    if (!include.length) {
      return []
    }

    const includePatterns = include
    const excludePatterns = ['**/node_modules/**', ...exclude]

    const excludeGlob =
      excludePatterns.length > 0
        ? excludePatterns.length > 1
          ? `{${excludePatterns.join(',')}}`
          : excludePatterns[0]
        : undefined

    // Process each include pattern separately to avoid nested alternate groups
    const allFilesMap = new Map<string, vscode.Uri>()

    for (const includePattern of includePatterns) {
      const files = await vscode.workspace.findFiles(includePattern, excludeGlob)
      for (const file of files) {
        allFilesMap.set(file.toString(), file)
      }
    }

    const allFiles = Array.from(allFilesMap.values())

    const filteredFiles = allFiles.filter((uri) => {
      return !gitignoreHelper.isIgnored(uri)
    })

    return filteredFiles
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
        '**/loccy.{yaml,config.json}',
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
      const uris = await this.getFileUris(this.usagesIncludePaths, [
        ...this.usagesExcludePaths,
        '**/loccy.{yaml,config.json}',
      ])
      return uris
    } catch (e) {
      handleError({
        internal: 'getResourcePaths: failed to find resource files',
        e,
      })
      return []
    }
  }

  checkFileType(uri: vscode.Uri): FileType | undefined {
    if (gitignoreHelper.isIgnored(uri)) {
      return
    }

    const relativePath = vscode.workspace.asRelativePath(uri)

    // First check cached paths
    if (this.translationFileUris.find((u) => u.toString() === uri.toString())) {
      return FileType.Resource
    }

    if (this.srcFileUris.find((u) => u.toString() === uri.toString())) {
      return FileType.Source
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
    if (gitignoreHelper.isIgnored(uri)) {
      return false
    }

    const relativePath = vscode.workspace.asRelativePath(uri)

    if (type === FileType.Resource) {
      return this.matchesResourcePattern(relativePath)
    } else if (type === FileType.Source) {
      return this.matchesSourcePattern(relativePath)
    }

    return false
  }

  private matchesResourcePattern(relativePath: string): boolean {
    try {
      const excludePatterns = [...this.translationExcludePaths, '**/loccy.config.{yaml,json}', '**/node_modules/**']

      if (this.matchesAnyPattern(relativePath, excludePatterns)) {
        return false
      }

      const includePatterns = this.translationIncludePaths
      return this.matchesAnyPattern(relativePath, includePatterns)
    } catch (e) {
      handleError({
        internal: `Error checking resource pattern for: ${relativePath}`,
        e,
      })
      return false
    }
  }

  private matchesSourcePattern(relativePath: string): boolean {
    try {
      const excludePatterns = [...this.usagesExcludePaths, '**/loccy.config.{yaml,json}', '**/node_modules/**']

      if (this.matchesAnyPattern(relativePath, excludePatterns)) {
        return false
      }

      const includePatterns = this.usagesIncludePaths
      return this.matchesAnyPattern(relativePath, includePatterns)
    } catch (e) {
      handleError({
        internal: `Error checking source pattern for: ${relativePath}`,
        e,
      })
      return false
    }
  }

  private matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
    return patterns.some((pattern) => {
      try {
        return minimatch(relativePath, pattern)
      } catch (e) {
        handleError({
          internal: `Error matching pattern '${pattern}' against '${relativePath}'`,
          e,
        })
        return false
      }
    })
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
    if (this.matchesResourcePattern(vscode.workspace.asRelativePath(uri)) && !gitignoreHelper.isIgnored(uri)) {
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
    if (this.matchesSourcePattern(vscode.workspace.asRelativePath(uri)) && !gitignoreHelper.isIgnored(uri)) {
      this.srcFileUris.push(uri)
    }
  }

  async removeSourceFile(uri: vscode.Uri): Promise<void> {
    const uriString = uri.toString()
    this.srcFileUris = this.srcFileUris.filter((u) => u.toString() !== uriString)
  }
}

export const fileResolver = new FileResolver()
