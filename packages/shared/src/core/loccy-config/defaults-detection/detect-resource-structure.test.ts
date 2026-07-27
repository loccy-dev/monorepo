import { describe, expect, it } from 'vitest'
import { detectResourceStructure } from './detect-resource-structure'

describe('detectResourceStructure', () => {
  it('detects namespace structure (locale dir, namespace filename)', () => {
    expect(detectResourceStructure(['locales/en/common.json', 'locales/de/common.json'], 'custom')).toBe('namespace')
  })

  it('detects locale structure (locale filename, no locale dir)', () => {
    expect(detectResourceStructure(['messages/en.json', 'messages/de.json'], 'custom')).toBe('locale')
  })

  it('falls back to the framework default on a tie', () => {
    // one namespace-style path, one locale-style path → tied score → framework decides.
    // react-i18next defaults to 'namespace', so a naive locale-favoring tiebreak would fail this.
    expect(detectResourceStructure(['locales/en/common.json', 'messages/en.json'], 'react-i18next')).toBe('namespace')
  })

  it('defaults to locale on a tie when the framework has no preference', () => {
    expect(detectResourceStructure([], 'custom')).toBe('locale')
  })
})
