import { describe, expect, it } from 'vitest'
import { createUsageScanner } from './usage-scanner'
import { makeModule, makePlatform } from '../loccy-config/test-fixtures'

const scan = async (files: Record<string, string>, keypaths: string[], over = {}) => {
  const module = makeModule({ usages: { include: ['src/**/*.ts'], ...over } })
  const scanner = await createUsageScanner(makePlatform(files), module, keypaths, null)
  return scanner.scan()
}

describe('UsageScanner.scan', () => {
  it('detects a static t() usage with its file, keypath, type and range', async () => {
    const content = "const x = t('greeting.hello')\n"
    const result = await scan({ 'src/a.ts': content }, ['greeting.hello'])

    const infos = result.perFile.get('src/a.ts')!
    expect(infos).toHaveLength(1)
    expect(infos[0]!.keypaths).toEqual(['greeting.hello'])
    expect(infos[0]!.type).toBe('static')
    // range spans the string literal token (quotes included), matching `content`
    const { start, end } = infos[0]!.loc
    expect(content.slice(start, end)).toBe("'greeting.hello'")
    expect(infos[0]!.content).toBe("'greeting.hello'")
  })

  it('scans every included file, not just the first', async () => {
    const result = await scan({ 'src/a.ts': "t('one')\n", 'src/b.ts': "t('two')\n" }, ['one', 'two'])
    expect(result.perFile.get('src/a.ts')?.[0]!.keypaths).toEqual(['one'])
    expect(result.perFile.get('src/b.ts')?.[0]!.keypaths).toEqual(['two'])
  })

  it('with detectKeysInStrings, a bare string equal to a known keypath counts as a usage', async () => {
    const result = await scan({ 'src/a.ts': "const key = 'greeting.hello'\n" }, ['greeting.hello'], {
      detectKeysInStrings: true,
    })
    const used = [...result.perFile.values()].flat().flatMap((i) => i.keypaths)
    expect(used).toContain('greeting.hello')
  })

  it('with detectKeysInStrings off, a bare string is not treated as a usage', async () => {
    const result = await scan({ 'src/a.ts': "const key = 'greeting.hello'\n" }, ['greeting.hello'], {
      detectKeysInStrings: false,
    })
    const used = [...result.perFile.values()].flat().flatMap((i) => i.keypaths)
    expect(used).not.toContain('greeting.hello')
  })

  it('collects loccy-used-keys directives with their file and pattern', async () => {
    const result = await scan({ 'src/a.ts': '// loccy-used-keys: greeting.*\n' }, ['greeting.hello'])
    expect(result.usedKeyDirectives).toEqual([expect.objectContaining({ file: 'src/a.ts', patterns: ['greeting.*'] })])
  })

  it('a file with no usages is absent from the result map', async () => {
    const result = await scan({ 'src/a.ts': 'const noop = 1\n' }, ['greeting.hello'])
    expect(result.perFile.has('src/a.ts')).toBe(false)
  })
})
