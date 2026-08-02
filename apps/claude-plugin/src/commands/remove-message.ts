import type { LocalizedText } from '@repo/types/primitives.types'
import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { fail, loadModuleContext, requireKeypath, resolveNamespace, type KeyOptions } from '../context'
import { blockIfStillUsed, scanUsages } from '../usages'
import { writeAllOrNothing } from '../write'

/** Remove keys from every locale file that holds them. Refuses while the code still references one. */
export async function removeMessageCommand(keys: string[], options: KeyOptions & { force?: boolean }): Promise<void> {
  const ctx = await loadModuleContext(options)
  const ns = resolveNamespace(ctx, options)
  const resolved = keys.map((key) => ({ ns, keypath: requireKeypath(key) }))

  const missing = resolved.filter(
    ({ ns, keypath }) => !Object.values(ctx.rm.getFlatTranslationsPerLocale(ns)).some((flat) => keypath in flat),
  )
  if (missing.length) {
    fail(`error: not found: ${missing.map(({ ns, keypath }) => qualifyKey(ns, keypath)).join(', ')}`)
  }

  blockIfStillUsed(ctx, await scanUsages(ctx, resolved), resolved, options.force ?? false)

  const changed = new Map<string, string>()
  for (const { ns, keypath } of resolved) {
    // Only clear locales that actually have the key, so no empty file is created for the rest.
    const cleared: LocalizedText = {}
    for (const [locale, flat] of Object.entries(ctx.rm.getFlatTranslationsPerLocale(ns))) {
      if (keypath in flat) cleared[locale] = ''
    }
    for (const [filePath, content] of ctx.rm.updateValue(keypath, cleared, ns)) changed.set(filePath, content)
  }

  await writeAllOrNothing(ctx.platform, changed)

  console.log(`removed: ${resolved.map(({ ns, keypath }) => qualifyKey(ns, keypath)).join(', ')}`)
  console.log(`files: ${[...changed.keys()].join(', ')}`)
}
