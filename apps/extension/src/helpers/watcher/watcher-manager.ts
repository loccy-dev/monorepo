import * as vscode from 'vscode'
import { debounce, DebouncedFunc } from 'lodash'
import { DirectoryWatcher } from './directory-watcher'
import { ChangeQueue } from './change-queue'
import { ErrorRecovery } from './error-recovery'
import { ChangeType, WatcherManagerConfig } from './watcher.types'
import { Logger } from '../logger'
import { minimatch } from 'minimatch'
import { cfg } from '../../global-config'
import { DEFAULT_IGNORE_GLOBS } from '@repo/types/platform.types'
import { toRootRelative } from '../vscode-platform'

const DEBOUNCE_DELAY = 1000

interface ServiceHandlers {
  onCreate?: (uri: vscode.Uri) => Promise<void>
  onUpdate?: (uris: vscode.Uri[]) => Promise<void>
  onDelete?: (uris: vscode.Uri[]) => Promise<void>
}

interface FileChanges {
  created: vscode.Uri[]
  updated: vscode.Uri[]
  deleted: vscode.Uri[]
}

/**
 * Central coordinator for all file watching operations.
 * Manages resource and source file watchers with intelligent batching and debouncing.
 */
export class WatcherManager {
  private translationFileWatcher: DirectoryWatcher | null = null
  private sourceWatcher: DirectoryWatcher | null = null

  private changeQueue: ChangeQueue
  private debouncedProcessor: DebouncedFunc<() => Promise<void>>
  private errorRecovery: ErrorRecovery

  private config: WatcherManagerConfig
  private isDisposed = false

  private resourceServiceHandlers: ServiceHandlers = {}

  private usageServiceHandlers: ServiceHandlers = {}

  constructor() {
    this.config = this.buildConfig()
    this.changeQueue = new ChangeQueue()
    this.errorRecovery = new ErrorRecovery(this.config.retry)

    this.debouncedProcessor = debounce(() => this.processChangeQueue(), DEBOUNCE_DELAY)
  }

  buildConfig() {
    return {
      translationFilePatterns: {
        include: cfg.resourceGlobs.include,
        exclude: [...cfg.resourceGlobs.exclude, ...DEFAULT_IGNORE_GLOBS],
      },
      sourcePatterns: {
        include: cfg.usageGlobs.include,
        exclude: [...cfg.usageGlobs.exclude, ...DEFAULT_IGNORE_GLOBS],
      },
      retry: {
        maxAttempts: 3,
        baseBackoffMs: 1000,
        backoffMultiplier: 2,
      },
    }
  }

  setResourceServiceHandlers(handlers: ServiceHandlers): void {
    this.resourceServiceHandlers = handlers
  }

  setUsageServiceHandlers(handlers: ServiceHandlers): void {
    this.usageServiceHandlers = handlers
  }

  async initialize(): Promise<void> {
    if (this.isDisposed) {
      throw new Error('Cannot initialize disposed WatcherManager')
    }

    if (this.config.translationFilePatterns.include.length > 0) {
      await this.createResourceWatcher()
    }

    if (this.config.sourcePatterns.include.length > 0) {
      await this.createSourceWatcher()
    }
  }

  private async createResourceWatcher(): Promise<void> {
    const translationGlob = this.buildGlobPattern(this.config.translationFilePatterns.include)

    this.translationFileWatcher = new DirectoryWatcher(translationGlob, {
      includePatterns: this.config.translationFilePatterns.include,
      excludePatterns: this.config.translationFilePatterns.exclude,
      handlers: {
        onCreate: (uri) => this.handleChange(uri, ChangeType.Create),
        onUpdate: (uri) => this.handleChange(uri, ChangeType.Update),
        onDelete: (uri) => this.handleChange(uri, ChangeType.Delete),
      },
    })

    Logger.info('Resource file watcher initialized successfully')
  }

  private async createSourceWatcher(): Promise<void> {
    const sourceGlob = this.buildGlobPattern(this.config.sourcePatterns.include)

    this.sourceWatcher = new DirectoryWatcher(sourceGlob, {
      includePatterns: this.config.sourcePatterns.include,
      excludePatterns: this.config.sourcePatterns.exclude,
      handlers: {
        onCreate: (uri) => this.handleChange(uri, ChangeType.Create),
        onUpdate: (uri) => this.handleChange(uri, ChangeType.Update),
        onDelete: (uri) => this.handleChange(uri, ChangeType.Delete),
      },
    })

    Logger.info('Source file watcher initialized successfully')
  }

  /** Caller must trigger a full rescan (ResourceService/UsageService) after this — reinit doesn't do it. */
  async reinitialize(): Promise<void> {
    this.disposeWatchers()
    this.config = this.buildConfig()
    await this.initialize()
  }

  private async handleChange(uri: vscode.Uri, type: ChangeType): Promise<void> {
    if (this.isDisposed) {
      return
    }
    this.changeQueue.add(uri, type)
    this.debouncedProcessor()
  }

  private async processChangeQueue(): Promise<void> {
    if (this.isDisposed) {
      return
    }

    const changes = this.changeQueue.getAll()
    if (changes.length === 0) {
      return
    }

    // Clear queue immediately to avoid reprocessing
    this.changeQueue.clear()

    const translationFileChanges: FileChanges = { created: [], updated: [], deleted: [] }
    const sourceChanges: FileChanges = { created: [], updated: [], deleted: [] }

    // Already filtered by DirectoryWatcher; here we just bucket by pattern category.
    for (const change of changes) {
      const relativePath = toRootRelative(change.uri)
      if (!relativePath) {
        continue
      }

      const isResource = this.matchesAnyPattern(relativePath, this.config.translationFilePatterns.include)
      const isSource = this.matchesAnyPattern(relativePath, this.config.sourcePatterns.include)

      if (isResource) {
        switch (change.type) {
          case ChangeType.Create:
            translationFileChanges.created.push(change.uri)
            break
          case ChangeType.Update:
            translationFileChanges.updated.push(change.uri)
            break
          case ChangeType.Delete:
            translationFileChanges.deleted.push(change.uri)
            break
        }
      }

      if (isSource) {
        switch (change.type) {
          case ChangeType.Create:
            sourceChanges.created.push(change.uri)
            break
          case ChangeType.Update:
            sourceChanges.updated.push(change.uri)
            break
          case ChangeType.Delete:
            sourceChanges.deleted.push(change.uri)
            break
        }
      }
    }

    await this.processChanges(translationFileChanges, this.resourceServiceHandlers, 'resource file')
    await this.processChanges(sourceChanges, this.usageServiceHandlers, 'source file')
  }

  private async processChanges(
    changes: FileChanges,
    handlers: ServiceHandlers,
    noun: 'resource file' | 'source file',
  ): Promise<void> {
    // Process creates with individual error handling
    for (const uri of changes.created) {
      if (handlers.onCreate) {
        try {
          await this.errorRecovery.retryWithBackoff(() => handlers.onCreate!(uri), {
            uri,
            operation: 'read',
            maxAttempts: this.config.retry.maxAttempts,
          })
        } catch (error) {
          Logger.error(
            `Failed to process ${noun} creation for ${this.asRelativePath(uri)}: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    // Process updates in batch with error handling
    if (changes.updated.length > 0 && handlers.onUpdate) {
      try {
        await handlers.onUpdate(changes.updated)
      } catch (error) {
        Logger.error(`Failed to process ${noun} updates: ${error instanceof Error ? error.message : String(error)}`)
        // Try processing individually on batch failure
        for (const uri of changes.updated) {
          try {
            await this.errorRecovery.retryWithBackoff(() => handlers.onUpdate!([uri]), {
              uri,
              operation: 'read',
              maxAttempts: this.config.retry.maxAttempts,
            })
          } catch (individualError) {
            Logger.error(
              `Failed to process ${noun} update for ${this.asRelativePath(uri)}: ${individualError instanceof Error ? individualError.message : String(individualError)}`,
            )
          }
        }
      }
    }

    // Process deletes in batch with error handling
    if (changes.deleted.length > 0 && handlers.onDelete) {
      try {
        await handlers.onDelete(changes.deleted)
      } catch (error) {
        Logger.error(`Failed to process ${noun} deletions: ${error instanceof Error ? error.message : String(error)}`)
        // Try processing individually on batch failure
        for (const uri of changes.deleted) {
          try {
            await handlers.onDelete([uri])
          } catch (individualError) {
            Logger.error(
              `Failed to process ${noun} deletion for ${this.asRelativePath(uri)}: ${individualError instanceof Error ? individualError.message : String(individualError)}`,
            )
          }
        }
      }
    }
  }

  private matchesAnyPattern(path: string, patterns: string[]): boolean {
    if (patterns.length === 0) {
      return false
    }

    for (const pattern of patterns) {
      if (this.matchPattern(path, pattern)) {
        return true
      }
    }

    return false
  }

  private buildGlobPattern(patterns: string[]): string {
    if (patterns.length === 0) {
      Logger.error('buildGlobPattern: no patterns provided, using generic glob')
      return '**/*'
    }

    if (patterns.length === 1) {
      return patterns[0]
    }

    // in more complicated setup just watch all and filter on change
    return `**/*`
  }

  private matchPattern(path: string, pattern: string): boolean {
    return minimatch(path, pattern)
  }

  private asRelativePath(uri: vscode.Uri): string {
    return vscode.workspace.asRelativePath(uri, true)
  }

  /** Used during reinitialization. */
  private disposeWatchers(): void {
    if (this.translationFileWatcher) {
      this.translationFileWatcher.dispose()
      this.translationFileWatcher = null
    }

    if (this.sourceWatcher) {
      this.sourceWatcher.dispose()
      this.sourceWatcher = null
    }
  }

  dispose(): void {
    if (this.isDisposed) {
      return
    }

    this.isDisposed = true
    this.debouncedProcessor.cancel()
    this.changeQueue.clear()
    this.disposeWatchers()
  }
}
