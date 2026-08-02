// Test-only fixtures for the resolved config/module shapes.

import type { LoccyConfig, ResolvedModule, UsagesConfig, TranslationsConfig } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'

/** In-memory `Platform` backed by a flat `path -> content` map — no `writeFile` support. */
export function makePlatform(files: Record<string, string>): Platform {
  return {
    rootPath: '/',
    async readFile(path: string) {
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
    async exists(path: string) {
      return path in files
    },
    async findFiles() {
      return Object.keys(files)
    },
  }
}

type ModuleOverride = Partial<Omit<ResolvedModule, 'usages' | 'translations'>> & {
  usages?: Partial<UsagesConfig>
  translations?: Partial<TranslationsConfig>
}

export function makeModule(over: ModuleOverride = {}): ResolvedModule {
  return {
    name: 'default',
    framework: 'custom',
    ...over,
    usages: {
      include: [],
      exclude: [],
      customTFunctions: [],
      detectKeysInStrings: true,
      noUnresolvedKeys: true,
      noUnusedKeys: true,
      ...over.usages,
    },
    translations: {
      messageFormat: 'icu',
      glob: '*.json',
      layout: '{locale}.json',
      exclude: [],
      noUntranslatedKeys: true,
      checkPlurals: true,
      sortKeys: false,
      ...over.translations,
    },
  }
}

export function makeConfig(over: Partial<LoccyConfig> = {}, module: ModuleOverride = {}): LoccyConfig {
  return { modules: { default: makeModule(module) }, ...over }
}
