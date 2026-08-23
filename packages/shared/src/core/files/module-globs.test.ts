import { describe, expect, it } from 'vitest'
import { matchesGlobs, resourceModuleName, sourceModuleNames } from './module-globs'
import { makeModule } from '../loccy-config/test-fixtures'

describe('matchesGlobs', () => {
  it('matches any of the include globs', () => {
    expect(matchesGlobs('src/a.vue', ['**/*.ts', '**/*.vue'])).toBe(true)
    expect(matchesGlobs('src/a.css', ['**/*.ts', '**/*.vue'])).toBe(false)
  })

  it('lets exclude win over include', () => {
    expect(matchesGlobs('src/generated/a.ts', ['**/*.ts'], ['**/generated/**'])).toBe(false)
  })

  it('matches nothing when there is nothing to include', () => {
    expect(matchesGlobs('src/a.ts', [])).toBe(false)
  })

  it('sees into dot directories, as file discovery does', () => {
    expect(matchesGlobs('.server/a.ts', ['**/*.ts'])).toBe(true)
    expect(matchesGlobs('.config/locales/en.json', ['**/locales/*.json'])).toBe(true)
  })

  it('matches a directory glob at the root', () => {
    expect(matchesGlobs('dist/a.json', ['**/dist/**'])).toBe(true)
    expect(matchesGlobs('app/dist/a.json', ['**/dist/**'])).toBe(true)
  })
})

const web = makeModule({
  name: 'web',
  translations: { glob: 'web/locales/*.json' },
  usages: { include: ['web/**/*.ts'] },
})
const admin = makeModule({
  name: 'admin',
  translations: { glob: 'admin/locales/*.json', exclude: ['**/*.draft.json'] },
  usages: { include: ['admin/**/*.ts', 'shared/**/*.ts'] },
})
const modules = [web, admin]

describe('resourceModuleName', () => {
  it('names the module whose glob covers the file', () => {
    expect(resourceModuleName('admin/locales/en.json', modules)).toBe('admin')
    expect(resourceModuleName('web/locales/en.json', modules)).toBe('web')
  })

  it('honours the module exclude', () => {
    expect(resourceModuleName('admin/locales/en.draft.json', modules)).toBeUndefined()
  })

  it('is undefined when no module claims the file', () => {
    expect(resourceModuleName('other/en.json', modules)).toBeUndefined()
  })

  it('takes the first module declared where two globs both cover the file', () => {
    const first = makeModule({ name: 'first', translations: { glob: 'locales/**/*.json' } })
    const second = makeModule({ name: 'second', translations: { glob: 'locales/en.json' } })
    expect(resourceModuleName('locales/en.json', [first, second])).toBe('first')
  })
})

describe('sourceModuleNames', () => {
  it('names every module claiming the file', () => {
    expect(sourceModuleNames('admin/a.ts', modules)).toEqual(['admin'])
    expect(sourceModuleNames('web/a.ts', modules)).toEqual(['web'])
  })

  it('is empty when no module claims the file', () => {
    expect(sourceModuleNames('scripts/a.ts', modules)).toEqual([])
  })
})
