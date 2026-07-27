import type { Platform } from '@repo/types/platform.types'

type Manifest = { glob: string; exclude: string; depKeys: string[] }

const MANIFESTS: Manifest[] = [
  { glob: '**/package.json', exclude: '**/node_modules/**', depKeys: ['dependencies', 'devDependencies'] },
  { glob: '**/composer.json', exclude: '**/vendor/**', depKeys: ['require', 'require-dev'] },
]

/** npm (`package.json`) + Composer (`composer.json`) manifests — covers JS and PHP ecosystems. */
export async function collectAllProjectDeps(platform: Platform): Promise<Set<string>> {
  const result = new Set<string>()

  for (const { glob, exclude, depKeys } of MANIFESTS) {
    const manifestFiles = await platform.findFiles([glob], [exclude])
    for (const filePath of manifestFiles) {
      try {
        const content = await platform.readFile(filePath)
        const manifest = JSON.parse(content)

        for (const depKey of depKeys) {
          for (const dep of Object.keys(manifest[depKey] ?? {})) result.add(dep)
        }
      } catch {
        continue
      }
    }
  }

  return result
}
