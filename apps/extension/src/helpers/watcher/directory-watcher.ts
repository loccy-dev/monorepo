import * as vscode from 'vscode'
import { matchesGlobs } from '@repo/shared/core/files/module-globs'
import { DirectoryWatcherConfig } from './watcher.types'
import { toRootRelative } from '../vscode-platform'
import { Logger } from '../logger'

/**
 * Watches a directory pattern and filters events based on include/exclude patterns.
 */
export class DirectoryWatcher {
  private watcher: vscode.FileSystemWatcher
  private config: DirectoryWatcherConfig
  private isDisposed = false

  constructor(globPattern: string, config: DirectoryWatcherConfig) {
    this.config = config

    this.watcher = vscode.workspace.createFileSystemWatcher(
      `**/${globPattern}`, // without **/ just doesn't work (vscode 1.105.1); maybe will be fixed later
      false, // ignoreCreateEvents
      false, // ignoreChangeEvents
      false, // ignoreDeleteEvents
    )

    this.watcher.onDidCreate(this.handleCreate.bind(this))
    this.watcher.onDidChange(this.handleChange.bind(this))
    this.watcher.onDidDelete(this.handleDelete.bind(this))
  }

  /**
   * Check if a URI matches the include/exclude patterns
   */
  private matchesPatterns(uri: vscode.Uri): boolean {
    if (uri.scheme !== 'file') {
      return false
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri)
    if (!workspaceFolder) {
      return false
    }

    const relativePath = toRootRelative(uri)
    if (!relativePath) {
      return false
    }

    return matchesGlobs(relativePath, this.config.includePatterns, this.config.excludePatterns)
  }

  private async handleCreate(uri: vscode.Uri): Promise<void> {
    if (this.isDisposed) {
      return
    }

    if (!this.matchesPatterns(uri)) {
      return
    }

    try {
      await this.config.handlers.onCreate(uri)
    } catch (error) {
      this.logHandlerError('create', uri, error)
    }
  }

  private async handleChange(uri: vscode.Uri): Promise<void> {
    if (this.isDisposed) {
      return
    }

    if (!this.matchesPatterns(uri)) {
      return
    }

    try {
      await this.config.handlers.onUpdate(uri)
    } catch (error) {
      this.logHandlerError('update', uri, error)
    }
  }

  private async handleDelete(uri: vscode.Uri): Promise<void> {
    if (this.isDisposed) {
      return
    }

    if (!this.matchesPatterns(uri)) {
      return
    }

    try {
      await this.config.handlers.onDelete(uri)
    } catch (error) {
      this.logHandlerError('delete', uri, error)
    }
  }

  private logHandlerError(operation: string, uri: vscode.Uri, error: unknown): void {
    const relativePath = vscode.workspace.asRelativePath(uri, false)
    const errorMessage = error instanceof Error ? error.message : String(error)
    const errorCode = this.extractErrorCode(errorMessage)

    switch (errorCode) {
      case 'ENOENT':
        Logger.warn(`File not found during ${operation}: ${relativePath}`)
        break
      case 'EACCES':
      case 'EPERM':
        Logger.error(`Permission denied for ${operation} operation on: ${relativePath}`)
        vscode.window.showErrorMessage(`Loccy: Permission denied accessing file: ${relativePath}`)
        break
      case 'EBUSY':
        Logger.warn(`File is busy during ${operation}, will retry: ${relativePath}`)
        break
      default:
        Logger.error(`Error handling file ${operation} for ${relativePath}: ${errorMessage}`)
    }
  }

  private extractErrorCode(message: string): string | null {
    const match = message.match(/\b(E[A-Z]+)\b/)
    return match ? match[1] : null
  }

  dispose(): void {
    if (this.isDisposed) {
      return
    }

    this.isDisposed = true
    this.watcher.dispose()
  }
}
