import { describe, expect, it } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { makeModule } from '@repo/shared/core/loccy-config/test-fixtures'
import { readModuleFiles } from './module-files'

const module = makeModule({ translations: { glob: '**/*.json' } })

function platform(files: Record<string, string>, failReads: string[] = []): Platform {
  return {
    rootPath: '/',
    async readFile(path) {
      if (failReads.includes(path)) throw new Error('permission denied')
      const content = files[path]
      if (content === undefined) throw new Error(`no such file: ${path}`)
      return content
    },
    async writeFile() {
      throw new Error('not needed')
    },
    exists: async (path) => path in files,
    findFiles: async () => [...Object.keys(files), ...failReads],
  }
}

describe('readModuleFiles', () => {
  it('returns matched non-empty files with their resolved format', async () => {
    const { files, readFailures } = await readModuleFiles(platform({ 'en.json': '{"a":"1"}' }), module)
    expect(readFailures).toBe(0)
    expect(files.map((f) => f.filePath)).toEqual(['en.json'])
    expect(files[0]!.content).toBe('{"a":"1"}')
    expect(files[0]!.format).toBeTruthy()
  })

  it('skips files with an unregistered format extension', async () => {
    const { files } = await readModuleFiles(platform({ 'notes.txt': 'hello', 'en.json': '{}' }), module)
    expect(files.map((f) => f.filePath)).toEqual(['en.json'])
  })

  it('skips empty and whitespace-only files', async () => {
    const { files } = await readModuleFiles(platform({ 'empty.json': '   \n', 'en.json': '{"a":"1"}' }), module)
    expect(files.map((f) => f.filePath)).toEqual(['en.json'])
  })

  it('counts a read failure instead of silently dropping the file', async () => {
    const { files, readFailures } = await readModuleFiles(platform({ 'en.json': '{"a":"1"}' }, ['fr.json']), module)
    expect(readFailures).toBe(1)
    expect(files.map((f) => f.filePath)).toEqual(['en.json'])
  })
})
