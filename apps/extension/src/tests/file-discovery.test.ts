import * as assert from 'assert'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { findFilesUnder } from '../helpers/vscode-platform'
import { loccyConfigGlob } from '@repo/types/config.types'

const FIXTURE = {
  'loccy.yaml': 'modules:\n  default:\n    translations:\n      glob: "src/locales/**/*.json"\n',
  '.gitignore': 'node_modules\ndist\nsrc/locales/\nconvex/locales/\n',
  'src/locales/en.json': '{}',
  'src/locales/de.json': '{}',
  'convex/locales/en.json': '{}',
  'dist/locales/en.json': '{}',
}

suite('File discovery', () => {
  let root: vscode.Uri

  const names = async (patterns: string[], exclude: string[] = []) =>
    (await findFilesUnder(root, patterns, exclude))
      .map((uri) => path.relative(root.fsPath, uri.fsPath).split(path.sep).join('/'))
      .sort()

  suiteSetup(async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'loccy-discovery-'))
    root = vscode.Uri.file(dir)
    for (const [relativePath, content] of Object.entries(FIXTURE)) {
      const target = path.join(dir, relativePath)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, content, 'utf-8')
    }
  })

  suiteTeardown(async () => {
    await fs.rm(root.fsPath, { recursive: true, force: true })
  })

  test('resources are collected even when gitignored', async () => {
    assert.deepStrictEqual(await names(['src/locales/**/*.json', 'convex/locales/**/*.json']), [
      'convex/locales/en.json',
      'src/locales/de.json',
      'src/locales/en.json',
    ])
  })

  test('excludes with alternate groups are honoured, not rejected', async () => {
    assert.deepStrictEqual(await names(['**/locales/**/*.json'], ['**/locales/{de,fr}.json', loccyConfigGlob]), [
      'convex/locales/en.json',
      'src/locales/en.json',
    ])
  })

  test('build output is excluded by default', async () => {
    const found = await names(['**/*.json'])
    assert.ok(!found.includes('dist/locales/en.json'), `dist should be excluded, got ${found.join(', ')}`)
  })
})
