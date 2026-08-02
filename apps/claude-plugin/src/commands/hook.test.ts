import { describe, expect, it } from 'vitest'
import type { LoccyConfig } from '@repo/types/config.types'
import { moduleOwning } from './hook'

const config = {
  modules: {
    default: { translations: { glob: 'locales/**/*.json', exclude: ['locales/generated/**'] } },
    admin: { translations: { glob: 'admin/i18n/*.yaml' } },
  },
} as unknown as LoccyConfig

describe('moduleOwning', () => {
  it('names the module whose glob covers the file', () => {
    expect(moduleOwning(config, 'locales/en.json')).toBe('default')
    expect(moduleOwning(config, 'admin/i18n/de.yaml')).toBe('admin')
  })

  it('leaves source files alone', () => {
    expect(moduleOwning(config, 'src/LoginForm.tsx')).toBe(null)
  })

  it('respects the module exclude', () => {
    expect(moduleOwning(config, 'locales/generated/en.json')).toBe(null)
  })
})
