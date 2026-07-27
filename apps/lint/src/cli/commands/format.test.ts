import { describe, expect, it } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { makeModule } from '@repo/shared/core/loccy-config/test-fixtures'
import { sortModuleFiles } from './format'

describe('sortModuleFiles', () => {
  it('sorts and writes a file whose keys are out of order', async () => {
    const files: Record<string, string> = { 'en.json': '{"b":"B","a":"A"}' }
    const written: Record<string, string> = {}
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      async writeFile(path, content) {
        written[path] = content
      },
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ translations: { sortKeys: true } })

    const result = await sortModuleFiles(platform, module, false)

    expect(result).toEqual({ sorted: 1, needsSort: 0, failed: 0 })
    expect(Object.keys(JSON.parse(written['en.json']))).toEqual(['a', 'b'])
  })

  it('in check mode, reports an unsorted file without writing it', async () => {
    const files: Record<string, string> = { 'en.json': '{"b":"B","a":"A"}' }
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      writeFile: () => Promise.reject(new Error('should not be called in check mode')),
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ translations: { sortKeys: true } })

    const result = await sortModuleFiles(platform, module, true)

    expect(result).toEqual({ sorted: 0, needsSort: 1, failed: 0 })
  })

  it('does not count a file as sorted when writing the sorted content back fails, and reports the failure', async () => {
    const files: Record<string, string> = { 'en.json': '{"b":"B","a":"A"}' }
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      writeFile: () => Promise.reject(new Error('disk full')),
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ translations: { sortKeys: true } })

    const result = await sortModuleFiles(platform, module, false)

    // the write threw after the file was identified as needing a sort — must surface as a
    // failure, not be silently swallowed as if the file were merely unparseable.
    expect(result).toEqual({ sorted: 0, needsSort: 0, failed: 1 })
  })

  it('reports a file as failed when it cannot be read, instead of silently skipping it', async () => {
    const platform: Platform = {
      rootPath: '/',
      readFile: () => Promise.reject(new Error('permission denied')),
      writeFile: () => Promise.reject(new Error('should not be called — nothing was read to sort')),
      exists: async () => true,
      findFiles: async () => ['en.json'],
    }
    const module = makeModule({ translations: { sortKeys: true } })

    const result = await sortModuleFiles(platform, module, false)

    // a readFile failure must surface as a failure, not vanish the same way unparseable content does —
    // otherwise a module where every other file is sorted still reports "All files already sorted".
    expect(result).toEqual({ sorted: 0, needsSort: 0, failed: 1 })
  })

  it('does not touch already-sorted files', async () => {
    const files: Record<string, string> = { 'en.json': '{"a":"A","b":"B"}' }
    const platform: Platform = {
      rootPath: '/',
      async readFile(path) {
        const content = files[path]
        if (content === undefined) throw new Error(`no such file: ${path}`)
        return content
      },
      writeFile: () => Promise.reject(new Error('should not be called')),
      exists: async (path) => path in files,
      findFiles: async () => Object.keys(files),
    }
    const module = makeModule({ translations: { sortKeys: true } })

    const result = await sortModuleFiles(platform, module, false)

    expect(result).toEqual({ sorted: 0, needsSort: 0, failed: 0 })
  })
})
