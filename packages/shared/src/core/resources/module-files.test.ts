import { describe, expect, it } from 'vitest'
import type { Platform } from '@repo/types/platform.types'
import { makeModule } from '../loccy-config/test-fixtures'
import { readModuleFiles, sortModuleFiles, type SortOutcome } from './module-files'

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
    async deleteFile() {
      throw new Error('not needed')
    },
    exists: async (path) => path in files,
    findFiles: async () => [...Object.keys(files), ...failReads],
  }
}

describe('readModuleFiles', () => {
  it('returns matched non-empty files with their resolved format', async () => {
    const { files, readFailures } = await readModuleFiles(platform({ 'en.json': '{"a":"1"}' }), module)
    expect(readFailures).toEqual([])
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

  it('reports a read failure instead of silently dropping the file', async () => {
    const { files, readFailures } = await readModuleFiles(platform({ 'en.json': '{"a":"1"}' }, ['fr.json']), module)
    expect(readFailures).toEqual([{ filePath: 'fr.json', error: 'permission denied' }])
    expect(files.map((f) => f.filePath)).toEqual(['en.json'])
  })
})

describe('sortModuleFiles', () => {
  const sortable = makeModule({ translations: { glob: '**/*.json', sortKeys: true } })

  /** Writable platform: `writeFile` records instead of throwing, or fails when `failWrite` is set. */
  function writablePlatform(files: Record<string, string>, written: Record<string, string>, failWrite = false) {
    const base = platform(files)
    return {
      ...base,
      async writeFile(path: string, content: string) {
        if (failWrite) throw new Error('disk full')
        written[path] = content
      },
    }
  }

  const outcomes = (files: { outcome: SortOutcome }[]) => files.map((file) => file.outcome)

  it('sorts and writes a file whose keys are out of order', async () => {
    const written: Record<string, string> = {}
    const result = await sortModuleFiles(writablePlatform({ 'en.json': '{"b":"B","a":"A"}' }, written), sortable, false)

    expect(outcomes(result.files)).toEqual(['sorted'])
    expect(Object.keys(JSON.parse(written['en.json']!))).toEqual(['a', 'b'])
  })

  it('in check mode, reports an unsorted file without writing it', async () => {
    const written: Record<string, string> = {}
    const result = await sortModuleFiles(writablePlatform({ 'en.json': '{"b":"B","a":"A"}' }, written), sortable, true)

    expect(outcomes(result.files)).toEqual(['needs-sort'])
    expect(written).toEqual({})
  })

  it('reports a failure when writing the sorted content back fails, rather than counting it sorted', async () => {
    const result = await sortModuleFiles(
      writablePlatform({ 'en.json': '{"b":"B","a":"A"}' }, {}, true),
      sortable,
      false,
    )

    expect(result.files).toEqual([{ filePath: 'en.json', outcome: 'failed', error: 'disk full' }])
  })

  it('surfaces an unreadable file as a read failure rather than dropping it', async () => {
    const result = await sortModuleFiles(platform({ 'en.json': '{"a":"A"}' }, ['fr.json']), sortable, false)

    // otherwise a module where every other file is sorted still reports "all files already sorted"
    expect(result.readFailures).toEqual([{ filePath: 'fr.json', error: 'permission denied' }])
  })

  it('leaves already-sorted files alone', async () => {
    const written: Record<string, string> = {}
    const result = await sortModuleFiles(writablePlatform({ 'en.json': '{"a":"A","b":"B"}' }, written), sortable, false)

    expect(outcomes(result.files)).toEqual(['skipped'])
    expect(written).toEqual({})
  })
})
