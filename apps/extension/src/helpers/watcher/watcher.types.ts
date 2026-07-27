import * as vscode from 'vscode'
import { ErrorRecoveryConfig } from './error-recovery'

export enum ChangeType {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
}

export interface QueuedChange {
  uri: vscode.Uri
  type: ChangeType
  timestamp: number
}

export interface DirectoryWatcherConfig {
  includePatterns: string[]
  excludePatterns: string[]
  handlers: {
    onCreate: (uri: vscode.Uri) => Promise<void>
    onUpdate: (uri: vscode.Uri) => Promise<void>
    onDelete: (uri: vscode.Uri) => Promise<void>
  }
}

export interface WatcherManagerConfig {
  translationFilePatterns: {
    include: string[]
    exclude: string[]
  }
  sourcePatterns: {
    include: string[]
    exclude: string[]
  }
  retry: ErrorRecoveryConfig
}
