import { describe, it, expect } from 'vitest'
import {
  detectFrameworkFromDeps,
  getFramework,
  getFrameworkOrCustom,
  getResourceFormatByExt,
  listFrameworks,
  listResourceFormats,
  parseResourceFile,
} from './registry'
import { jsonResourceFormat } from './resources/json-parser'
import { customFramework } from './frameworks/custom'

describe('getFrameworkOrCustom', () => {
  it('resolves a registered id', () => {
    expect(getFrameworkOrCustom('vue-i18n')).toBe(getFramework('vue-i18n'))
  })

  it('falls back to custom for an unregistered/bogus id', () => {
    expect(getFrameworkOrCustom('not-a-real-framework')).toBe(customFramework)
  })
})

describe('detectFrameworkFromDeps', () => {
  it('picks the first matching framework in registration priority order', () => {
    // both vue-i18n and react-i18next could theoretically match a monorepo's combined deps;
    // registration order (vue-i18n before react-i18next) breaks the tie.
    expect(detectFrameworkFromDeps(new Set(['vue-i18n', 'react-i18next']))).toBe('vue-i18n')
  })

  it('returns undefined when no framework detects', () => {
    expect(detectFrameworkFromDeps(new Set(['some-unrelated-package']))).toBeUndefined()
  })
})

describe('resource format registration', () => {
  it('every resource format is reachable by each of its declared extensions', () => {
    for (const format of listResourceFormats()) {
      for (const ext of format.extensions) {
        expect(getResourceFormatByExt(ext)?.id).toBe(format.id)
      }
    }
  })
})

describe('listFrameworks', () => {
  it('includes every framework registered in the registry', () => {
    const ids = listFrameworks().map((p) => p.id)
    expect(ids).toEqual(
      expect.arrayContaining(['next-intl', 'vue-i18n', 'react-i18next', 'laravel', 'spring', 'custom']),
    )
  })
})

describe('parseResourceFile', () => {
  it('parses content within the size limit', () => {
    const doc = parseResourceFile(jsonResourceFormat, '{"a":"b"}')
    expect(doc.flatData).toEqual({ a: 'b' })
  })

  it('throws for content over the size guard, before format-specific parsing runs', () => {
    const huge = `{"a":"${'x'.repeat(5 * 1024 * 1024 + 1)}"}`
    expect(() => parseResourceFile(jsonResourceFormat, huge)).toThrow(/too large/)
  })
})
