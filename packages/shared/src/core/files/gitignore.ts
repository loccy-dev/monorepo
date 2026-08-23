import ignore, { type Ignore } from 'ignore'
import type { Platform } from '@repo/types/platform.types'
import { extractDirname, extractFileName } from '../helpers/path.helpers'

const GITIGNORE_NAME = '.gitignore'

/**
 * Git's own ignore rules for a project, read from every `.gitignore` in the tree.
 * Meant for source discovery: resources are routinely generated and gitignored, yet still ours.
 */
export class Gitignore {
  private constructor(private readonly rulesByDir: Map<string, Ignore>) {}

  /** Ignores nothing. For the window before the real rules are read. */
  static empty(): Gitignore {
    return new Gitignore(new Map())
  }

  static async load(platform: Platform): Promise<Gitignore> {
    const paths = (await platform.findFiles([`**/${GITIGNORE_NAME}`])).filter(
      (path) => extractFileName(path, true) === GITIGNORE_NAME,
    )

    const rulesByDir = new Map<string, Ignore>()
    await Promise.all(
      paths.map(async (path) => {
        // a file that vanished between listing and reading simply has no rules to contribute
        const content = await platform.readFile(path).catch(() => null)
        if (content === null) {
          return
        }
        const dir = extractDirname(path)
        rulesByDir.set(dir === '.' ? '' : dir, ignore().add(content))
      }),
    )

    return new Gitignore(rulesByDir)
  }

  /** `relativePath` must be relative to the root the rules were loaded from. */
  isIgnored(relativePath: string): boolean {
    if (!ignore.isPathValid(relativePath)) {
      return false
    }

    let ignored = false
    for (const dir of ancestorDirs(relativePath)) {
      const rules = this.rulesByDir.get(dir)
      if (!rules) {
        continue
      }
      // walking downwards lets the deeper file override the shallower one, as git resolves them
      const result = rules.test(dir ? relativePath.slice(dir.length + 1) : relativePath)
      if (result.ignored) {
        ignored = true
      } else if (result.unignored) {
        ignored = false
      }
    }

    return ignored
  }
}

/** Root first, then every directory down to the one holding the file. */
function* ancestorDirs(relativePath: string): Generator<string> {
  yield ''

  const segments = relativePath.split('/')
  segments.pop()

  let dir = ''
  for (const segment of segments) {
    dir = dir ? `${dir}/${segment}` : segment
    yield dir
  }
}
