import { describe, expect, it } from 'vitest'
import { collectAllProjectDeps } from './from-project-deps'
import { makePlatform } from '../test-fixtures'

describe('collectAllProjectDeps', () => {
  it('merges dependencies and devDependencies from package.json', async () => {
    const platform = makePlatform({
      'package.json': JSON.stringify({
        dependencies: { 'react-i18next': '1.0.0' },
        devDependencies: { vitest: '1.0.0' },
      }),
    })
    const deps = await collectAllProjectDeps(platform)
    expect(deps).toEqual(new Set(['react-i18next', 'vitest']))
  })

  it('merges require/require-dev from composer.json alongside package.json', async () => {
    const platform = makePlatform({
      'package.json': JSON.stringify({ dependencies: { vue: '1.0.0' } }),
      'composer.json': JSON.stringify({ require: { 'laravel/framework': '10.0' }, 'require-dev': { phpunit: '1.0' } }),
    })
    const deps = await collectAllProjectDeps(platform)
    expect(deps).toEqual(new Set(['vue', 'laravel/framework', 'phpunit']))
  })

  it('ignores an unparseable manifest instead of throwing', async () => {
    const platform = makePlatform({ 'package.json': '{not valid json' })
    await expect(collectAllProjectDeps(platform)).resolves.toEqual(new Set())
  })
})
