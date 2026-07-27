import { describe, it, expect } from 'vitest'
import {
  computeStaticPrefix,
  extractDirname,
  extractFileExt,
  extractFileName,
  filePathToSegments,
  isAbsolutePath,
  joinPaths,
  normalizePath,
} from './path.helpers'

describe('extractFileName', () => {
  it('returns the basename without extension by default', () => {
    expect(extractFileName('src/en/common.json')).toBe('common')
  })

  it('keeps the extension when leaveExt is true', () => {
    expect(extractFileName('src/en/common.json', true)).toBe('common.json')
  })

  it('only strips the last extension for multi-dot filenames', () => {
    expect(extractFileName('archive.tar.gz')).toBe('archive.tar')
  })

  it('handles a bare filename with no directory', () => {
    expect(extractFileName('common.json')).toBe('common')
  })
})

describe('extractFileExt', () => {
  it('returns the extension without the leading dot', () => {
    expect(extractFileExt('common.json')).toBe('json')
  })

  it('returns an empty string when there is no extension', () => {
    expect(extractFileExt('common')).toBe('')
  })

  it('treats a dotfile as having no extension', () => {
    expect(extractFileExt('.gitignore')).toBe('')
  })
})

describe('extractDirname', () => {
  it('returns the parent directory', () => {
    expect(extractDirname('src/en/common.json')).toBe('src/en')
  })

  it('returns "." for a bare filename', () => {
    expect(extractDirname('common.json')).toBe('.')
  })

  it('returns "/" for a top-level absolute path', () => {
    expect(extractDirname('/common.json')).toBe('/')
  })
})

describe('joinPaths', () => {
  it('joins two path segments', () => {
    expect(joinPaths('a/b', 'c.json')).toBe('a/b/c.json')
  })

  it('resolves ".." segments', () => {
    expect(joinPaths('a/b', '../c.json')).toBe('a/c.json')
  })
})

describe('normalizePath', () => {
  it('resolves "." and ".." segments', () => {
    expect(normalizePath('a/./b/../c')).toBe('a/c')
  })

  it('collapses duplicate slashes', () => {
    expect(normalizePath('a//b')).toBe('a/b')
  })
})

describe('isAbsolutePath', () => {
  it('returns true for an absolute path', () => {
    expect(isAbsolutePath('/a/b')).toBe(true)
  })

  it('returns false for a relative path', () => {
    expect(isAbsolutePath('a/b')).toBe(false)
  })
})

describe('computeStaticPrefix', () => {
  it('returns empty for no patterns', () => {
    expect(computeStaticPrefix([])).toBe('')
  })

  it('stops at the first glob segment', () => {
    expect(computeStaticPrefix(['src/emails/**/*.properties'])).toBe('src/emails')
    expect(computeStaticPrefix(['data/workspace-models/**/*.json'])).toBe('data/workspace-models')
  })

  it('stops at the first `*` even mid-segment', () => {
    expect(computeStaticPrefix(['data/*.json'])).toBe('data')
    expect(computeStaticPrefix(['data/*.json', 'data/*.json5'])).toBe('data')
  })

  it('stops at `{`, `?`, `[` glob-ish markers', () => {
    expect(computeStaticPrefix(['{locale}.json'])).toBe('')
    expect(computeStaticPrefix(['src/i18n/{locale}/{namespace}.json'])).toBe('src/i18n')
    expect(computeStaticPrefix(['a/b?/c'])).toBe('a')
    expect(computeStaticPrefix(['a/[x]/c'])).toBe('a')
  })

  it('intersects the common static prefix across patterns', () => {
    expect(computeStaticPrefix(['src/a/*.json', 'src/b/*.json'])).toBe('src')
    // no common prefix → empty
    expect(computeStaticPrefix(['a/*.json', 'b/*.json'])).toBe('')
  })

  it('returns the full path for a glob-free literal', () => {
    expect(computeStaticPrefix(['a/b/c.json'])).toBe('a/b/c.json')
  })
})

describe('filePathToSegments', () => {
  it('strips the include static prefix and dots the rest (sans extension)', () => {
    expect(filePathToSegments('src/locales/en/common.json', ['src/locales/**/*.json'])).toBe('en.common')
  })

  it('handles a flat single-file layout', () => {
    expect(filePathToSegments('src/locales/en.json', ['src/locales/*.json'])).toBe('en')
  })

  it('leaves the path intact when no prefix matches', () => {
    expect(filePathToSegments('en/common.json', ['totally/other/*.json'])).toBe('en.common')
  })
})
