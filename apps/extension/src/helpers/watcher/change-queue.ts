import * as vscode from 'vscode'
import { ChangeType, QueuedChange } from './watcher.types'

/** Batches/dedupes file changes; merge priority: delete > create > update. */
export class ChangeQueue {
  private queue: Map<string, QueuedChange>

  constructor() {
    this.queue = new Map()
  }

  /** Adds a change; merges with an existing entry for the same URI per priority rules. */
  add(uri: vscode.Uri, type: ChangeType): void {
    const key = uri.toString()
    const incomingChange: QueuedChange = {
      uri,
      type,
      timestamp: Date.now(),
    }

    const existingChange = this.queue.get(key)

    if (existingChange) {
      // Merge the changes according to priority rules
      const mergedChange = this.mergeChange(existingChange, incomingChange)
      this.queue.set(key, mergedChange)
    } else {
      // No existing change, just add it
      this.queue.set(key, incomingChange)
    }
  }

  getAll(): QueuedChange[] {
    return Array.from(this.queue.values())
  }

  clear(): void {
    this.queue.clear()
  }

  /**
   * Merge priority: delete > create > update; same type keeps most recent.
   * create+delete = delete (never existed); delete+create = update (replaced).
   */
  private mergeChange(existing: QueuedChange, incoming: QueuedChange): QueuedChange {
    if (incoming.type === ChangeType.Delete) {
      return incoming
    }

    if (existing.type === ChangeType.Delete) {
      if (incoming.type === ChangeType.Create) {
        // File was deleted then recreated = treat as update
        return {
          ...incoming,
          type: ChangeType.Update,
        }
      }
      return existing
    }

    if (incoming.type === ChangeType.Create) {
      if (existing.type === ChangeType.Create) {
        return incoming.timestamp > existing.timestamp ? incoming : existing
      }
      if (existing.type === ChangeType.Update) {
        return incoming
      }
    }

    if (incoming.type === ChangeType.Update) {
      if (existing.type === ChangeType.Create) {
        return existing
      }
      if (existing.type === ChangeType.Update) {
        return incoming.timestamp > existing.timestamp ? incoming : existing
      }
    }

    return incoming.timestamp > existing.timestamp ? incoming : existing
  }
}
