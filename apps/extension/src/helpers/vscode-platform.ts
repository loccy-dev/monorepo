// vscode-backed `Platform` for the shared config/detection/resource pipeline (`@repo/shared`).
// All paths are relative to the (primary) workspace root — the contract shared code expects.

import * as vscode from 'vscode'
import { DEFAULT_IGNORE_GLOBS, type Platform } from '@repo/types/platform.types'

function workspaceRoot(): vscode.Uri | null {
  return vscode.workspace.workspaceFolders?.[0]?.uri ?? null
}

/**
 * Build a `Platform` rooted at the primary workspace folder, or `null` when no folder is open.
 * `findFiles` combines patterns/excludes into vscode brace-globs; results come back workspace-relative.
 */
export function createVscodePlatform(): Platform | null {
  const root = workspaceRoot()
  if (!root) {
    return null
  }

  const toUri = (relativePath: string) => vscode.Uri.joinPath(root, relativePath)
  const brace = (globs: string[]) => (globs.length === 1 ? globs[0]! : `{${globs.join(',')}}`)

  return {
    rootPath: root.fsPath,

    async readFile(relativePath) {
      const bytes = await vscode.workspace.fs.readFile(toUri(relativePath))
      return new TextDecoder('utf-8').decode(bytes)
    },

    async writeFile(relativePath, content) {
      // vscode's fs.writeFile creates missing parent directories.
      await vscode.workspace.fs.writeFile(toUri(relativePath), new TextEncoder().encode(content))
    },

    async exists(relativePath) {
      try {
        await vscode.workspace.fs.stat(toUri(relativePath))
        return true
      } catch {
        return false
      }
    },

    async findFiles(patterns, exclude) {
      if (!patterns.length) {
        return []
      }
      const include = brace(patterns)
      const excludePattern = brace([...DEFAULT_IGNORE_GLOBS, ...(exclude ?? [])])
      const uris = await vscode.workspace.findFiles(include, excludePattern)
      return uris.map((uri) => vscode.workspace.asRelativePath(uri, false))
    },
  }
}
