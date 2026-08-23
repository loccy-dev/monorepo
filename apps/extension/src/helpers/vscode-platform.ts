// Loccy's root — the directory every config glob and relative path is resolved against — and the
// `Platform` (for `@repo/shared`'s config/detection/resource pipeline) rooted at it.

import * as vscode from 'vscode'
import { DEFAULT_IGNORE_GLOBS, type Platform } from '@repo/types/platform.types'
import { loccyConfigGlob } from '@repo/types/config.types'
import { detectTranslationsLocation } from '@repo/shared/core/loccy-config/defaults-detection/detect-translations-location'
import { matchesGlobs } from '@repo/shared/core/files/module-globs'

const NODE_MODULES_GLOB = '**/node_modules/**'

let rootPromise: Promise<vscode.Uri | null> | null = null
let root: vscode.Uri | null = null

/**
 * The directory Loccy works in: the one holding a loccy config (any depth, any workspace folder),
 * else the first folder with a detectable i18n setup, else the first folder. Memoized.
 */
export function getLoccyRoot(): Promise<vscode.Uri | null> {
  return (rootPromise ??= resolveRoot().then((resolved) => (root = resolved)))
}

/** Synchronous access to the already-resolved root (null before `getLoccyRoot()` completes). */
export function loccyRoot(): vscode.Uri | null {
  return root
}

export function resetLoccyRoot() {
  rootPromise = null
  root = null
}

/** Path of `uri` relative to Loccy's root, or null when it lies outside — no config glob can match it. */
export function toRootRelative(uri: vscode.Uri): string | null {
  if (root && uri.scheme === 'file') {
    return relativeTo(root, uri)
  }
  // no root yet, or an untitled/virtual doc with no place in the tree
  return vscode.workspace.asRelativePath(uri, false)
}

function relativeTo(base: vscode.Uri, uri: vscode.Uri): string | null {
  const prefix = base.path.endsWith('/') ? base.path : `${base.path}/`
  return uri.path.startsWith(prefix) ? uri.path.slice(prefix.length) : null
}

async function resolveRoot(): Promise<vscode.Uri | null> {
  const folders = vscode.workspace.workspaceFolders
  if (!folders?.length) {
    return null
  }

  // 1st try - the directory holding a loccy config, shallowest first
  for (const folder of folders) {
    const configs = await vscode.workspace.findFiles(
      new vscode.RelativePattern(folder, loccyConfigGlob),
      NODE_MODULES_GLOB,
    )
    const shallowest = configs.sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0]
    if (shallowest) {
      return vscode.Uri.joinPath(shallowest, '..')
    }
  }

  if (folders.length === 1) {
    return folders[0].uri
  }

  // 2nd try - the folder with a detectable i18n setup
  for (const folder of folders) {
    const candidates = await detectTranslationsLocation(createPlatform(folder.uri))
    if (candidates.length) {
      return folder.uri
    }
  }

  // 3d - just the first folder
  return folders[0].uri
}

/**
 * Search one pattern at a time and match the excludes here: vscode's search rejects a glob with
 * nested alternate groups (`{a,{b,c}}`), which joining patterns into one group inevitably builds.
 */
export async function findFilesUnder(root: vscode.Uri, patterns: string[], exclude: string[]): Promise<vscode.Uri[]> {
  const excludes = [...DEFAULT_IGNORE_GLOBS, ...exclude]
  const found = new Map<string, vscode.Uri>()

  for (const pattern of patterns) {
    const uris = await vscode.workspace.findFiles(new vscode.RelativePattern(root, pattern), NODE_MODULES_GLOB)
    for (const uri of uris) {
      const relativePath = relativeTo(root, uri)
      if (relativePath && !matchesGlobs(relativePath, excludes)) {
        found.set(uri.toString(), uri)
      }
    }
  }

  return [...found.values()]
}

/** Build a `Platform` rooted at `root`; its globs and returned paths are scoped to that directory. */
function createPlatform(root: vscode.Uri): Platform {
  const toUri = (relativePath: string) => vscode.Uri.joinPath(root, relativePath)

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

    async deleteFile(relativePath) {
      try {
        await vscode.workspace.fs.delete(toUri(relativePath))
      } catch {
        // already gone, which is the outcome the caller asked for
      }
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
      const uris = await findFilesUnder(root, patterns, exclude ?? [])
      return uris.map((uri) => relativeTo(root, uri)).filter((path): path is string => path !== null)
    },
  }
}

/** `Platform` rooted at Loccy's root, or `null` when no workspace folder is open. */
export async function createVscodePlatform(): Promise<Platform | null> {
  const resolved = await getLoccyRoot()
  return resolved ? createPlatform(resolved) : null
}
