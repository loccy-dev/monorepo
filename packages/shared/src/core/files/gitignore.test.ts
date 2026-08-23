import { describe, expect, it } from 'vitest'
import { Gitignore } from './gitignore'
import { makePlatform } from '../loccy-config/test-fixtures'

const load = (files: Record<string, string>) => Gitignore.load(makePlatform(files))

describe('Gitignore', () => {
  it('ignores nothing when the project has no .gitignore', async () => {
    const gitignore = await load({ 'src/a.ts': '' })
    expect(gitignore.isIgnored('src/a.ts')).toBe(false)
  })

  it('applies the root rules, skipping comments and blank lines', async () => {
    const gitignore = await load({ '.gitignore': '# build output\n\ngenerated/\n*.log\n' })

    expect(gitignore.isIgnored('generated/messages.ts')).toBe(true)
    expect(gitignore.isIgnored('src/debug.log')).toBe(true)
    expect(gitignore.isIgnored('src/a.ts')).toBe(false)
  })

  it('honours negation', async () => {
    const gitignore = await load({ '.gitignore': '*.log\n!keep.log\n' })

    expect(gitignore.isIgnored('src/debug.log')).toBe(true)
    expect(gitignore.isIgnored('src/keep.log')).toBe(false)
  })

  it('anchors a nested .gitignore to its own directory', async () => {
    const gitignore = await load({ 'app/.gitignore': '/generated/\n' })

    expect(gitignore.isIgnored('app/generated/a.ts')).toBe(true)
    expect(gitignore.isIgnored('generated/a.ts')).toBe(false)
  })

  it('applies an unanchored nested rule at any depth below its directory', async () => {
    const gitignore = await load({ 'app/.gitignore': 'vendor\n' })

    expect(gitignore.isIgnored('app/deep/nested/vendor/a.ts')).toBe(true)
    expect(gitignore.isIgnored('other/vendor/a.ts')).toBe(false)
  })

  it('lets a deeper .gitignore re-include what a shallower one ignored', async () => {
    const gitignore = await load({ '.gitignore': '*.log\n', 'src/.gitignore': '!debug.log\n' })

    expect(gitignore.isIgnored('src/debug.log')).toBe(false)
    expect(gitignore.isIgnored('other/debug.log')).toBe(true)
  })

  it('treats a path outside the root as not ignored', async () => {
    const gitignore = await load({ '.gitignore': '*.log\n' })
    expect(gitignore.isIgnored('/elsewhere/debug.log')).toBe(false)
  })
})
