import * as fs from 'fs/promises'
import * as path from 'path'
import { globby } from 'globby'
import { DEFAULT_IGNORE_GLOBS, type Platform } from '@repo/types/platform.types'

export function createNodePlatform(rootPath: string): Platform {
  return {
    rootPath,

    async readFile(relativePath: string): Promise<string> {
      return fs.readFile(path.join(rootPath, relativePath), 'utf-8')
    },

    async writeFile(relativePath: string, content: string): Promise<void> {
      const fullPath = path.join(rootPath, relativePath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content, 'utf-8')
    },

    async exists(relativePath: string): Promise<boolean> {
      try {
        await fs.access(path.join(rootPath, relativePath))
        return true
      } catch {
        return false
      }
    },

    async findFiles(patterns: string[], exclude?: string[]): Promise<string[]> {
      return globby(patterns, {
        cwd: rootPath,
        ignore: [...DEFAULT_IGNORE_GLOBS, ...(exclude ?? [])],
        gitignore: true,
        absolute: false,
        onlyFiles: true,
        dot: true,
      })
    },
  }
}
