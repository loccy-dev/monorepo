import * as vscode from 'vscode'
import ignore from 'ignore'
import { handleError } from './error-handler'
import { extractDirname, isAbsolutePath, joinPaths, normalizePath } from '@repo/shared/core/helpers/path.helpers'

/** Deeply reads all .gitignore files */
class GitignoreHelper {
  ig = ignore()

  async init() {
    try {
      // Reset the ignore instance to ensure clean state
      this.ig = ignore()

      const ignoreFiles = await vscode.workspace.findFiles('**/.gitignore', '**/node_modules/**')

      // Sort ignore files by depth (root first, then nested)
      const sortedIgnoreFiles = ignoreFiles.sort((a, b) => {
        const depthA = a.path.split('/').length
        const depthB = b.path.split('/').length
        return depthA - depthB
      })

      for (const ignoreFileUri of sortedIgnoreFiles) {
        await this.processGitignoreFile(ignoreFileUri)
      }
    } catch (e) {
      handleError({ internal: 'Failed to initialize gitignore helper', e })
    }
  }

  private async processGitignoreFile(ignoreFileUri: vscode.Uri) {
    try {
      const bytes = await vscode.workspace.fs.readFile(ignoreFileUri)
      const content = new TextDecoder('utf-8').decode(bytes)

      const relativeIgnoreDir = extractDirname(vscode.workspace.asRelativePath(ignoreFileUri))
      const lines = this.parseGitignoreContent(content)
      this.addIgnoreRules(lines, relativeIgnoreDir)
    } catch (e) {
      handleError({
        internal: `Failed to read .gitignore file: ${ignoreFileUri}`,
        e,
      })
    }
  }

  private parseGitignoreContent(content: string): string[] {
    return content
      .split(/\r?\n/) // Handle both Unix and Windows line endings
      .map((line) => line.trim())
      .filter((line) => {
        if (!line || line.startsWith('#')) {
          return false
        }

        if (line.startsWith('\\#') || line.startsWith('\\!')) {
          return true
        }

        return true
      })
      .map((line) => {
        // Handle escaped characters by removing the escape
        if (line.startsWith('\\#')) {
          return line.substring(1)
        }
        if (line.startsWith('\\!')) {
          return line.substring(1)
        }
        return line
      })
  }

  private addIgnoreRules(lines: string[], relativeIgnoreDir: string) {
    for (const line of lines) {
      try {
        let pattern = line

        const isNegation = pattern.startsWith('!')
        if (isNegation) {
          pattern = pattern.substring(1)
        }

        const isAbsolute = pattern.startsWith('/')
        if (isAbsolute) {
          pattern = pattern.substring(1)
        }

        // Apply path prefixing for nested .gitignore files
        if (relativeIgnoreDir && !isAbsolute) {
          const normalizedRelativeDir = normalizePath(relativeIgnoreDir)
          pattern = joinPaths(normalizedRelativeDir, pattern)
        }

        if (isNegation) {
          pattern = '!' + pattern
        }

        pattern = normalizePath(pattern)
        this.ig.add(pattern)
      } catch (e) {
        handleError({
          internal: `Failed to add ignore pattern: ${line}`,
          e,
        })
      }
    }
  }

  isIgnored(uri: vscode.Uri): boolean {
    try {
      const normalizedPath = normalizePath(vscode.workspace.asRelativePath(uri))
      if (isAbsolutePath(normalizedPath)) {
        // we only work with paths, relative to the project
        return true
      }
      return this.ig.ignores(normalizedPath)
    } catch (e) {
      handleError({
        internal: `Failed to check if path is ignored: ${vscode.workspace.asRelativePath(uri)}`,
        e,
      })
      return false
    }
  }
}

export const gitignoreHelper = new GitignoreHelper()
