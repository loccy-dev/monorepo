import * as vscode from 'vscode'
import { Logger } from '../logger'

export interface RetryContext {
  uri: vscode.Uri
  operation: 'read' | 'write' | 'watch'
  maxAttempts: number
}

export interface ErrorRecoveryConfig {
  maxAttempts: number
  baseBackoffMs: number
  backoffMultiplier: number
}

export class ErrorRecovery {
  private config: ErrorRecoveryConfig

  constructor(config?: Partial<ErrorRecoveryConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      baseBackoffMs: config?.baseBackoffMs ?? 1000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
    }
  }

  async retryWithBackoff<T>(operation: () => Promise<T>, context: RetryContext): Promise<T> {
    let attempt = 1
    let lastError: Error | undefined

    while (attempt <= context.maxAttempts) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        if (!this.shouldRetry(lastError)) {
          throw lastError
        }

        if (attempt >= context.maxAttempts) {
          Logger.error(
            `Failed ${context.operation} operation after ${attempt} attempts for ${this.asRelativePath(context.uri)}: ${lastError.message}`,
          )
          throw lastError
        }

        const delay = this.calculateBackoff(attempt)
        Logger.warn(
          `${context.operation} operation failed for ${this.asRelativePath(context.uri)} (attempt ${attempt}/${context.maxAttempts}), retrying in ${delay}ms: ${lastError.message}`,
        )

        await this.sleep(delay)
        attempt++
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Unknown error')
  }

  private calculateBackoff(attempt: number): number {
    return this.config.baseBackoffMs * Math.pow(this.config.backoffMultiplier, attempt - 1)
  }

  private shouldRetry(error: Error): boolean {
    const errorMessage = error.message.toLowerCase()

    const retryableErrors = [
      'ebusy', // File is busy/locked
      'eagain', // Resource temporarily unavailable
      'etimedout', // Operation timed out
      'econnreset', // Connection reset
      'epipe', // Broken pipe
      'locked', // File locked
      'busy', // Resource busy
    ]

    for (const retryableError of retryableErrors) {
      if (errorMessage.includes(retryableError)) {
        return true
      }
    }

    const nonRetryableErrors = [
      'enoent', // File not found
      'eacces', // Permission denied
      'eperm', // Operation not permitted
      'eisdir', // Is a directory
      'enotdir', // Not a directory
      'invalid', // Invalid argument
      'parse', // Parse error
    ]

    for (const nonRetryableError of nonRetryableErrors) {
      if (errorMessage.includes(nonRetryableError)) {
        return false
      }
    }

    // retry for unknown errors
    return true
  }

  private asRelativePath(uri: vscode.Uri): string {
    const relativePath = vscode.workspace.asRelativePath(uri, false)
    return relativePath
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
