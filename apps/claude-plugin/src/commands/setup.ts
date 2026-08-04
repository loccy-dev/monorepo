import type { LoccyConfig } from '@repo/types/config.types'
import type { Platform } from '@repo/types/platform.types'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { readConfigFile } from '@repo/shared/core/loccy-config/loccy-config'
import { createResourceManager } from '@repo/shared/core/resources/resource-manager'
import { renderModule } from '@repo/shared/core/loccy-config/config-templates'
import { collapsePaths } from '../file-list'
import { droppedStyleguideNote } from '../styleguide-output'
import { workflow } from '../tool-commands'

const MAX_FILES_LISTED = 20

/**
 * The config as `loccy.yaml` holds it, then the locales and namespaces the translation files
 * actually turned out to hold. The config goes in verbatim rather than described field by field:
 * a briefing that explains the setup is a second telling of it, and the yaml is already the one
 * every other surface reads.
 */
async function describeSetup(
  platform: Platform,
  config: LoccyConfig,
): Promise<{ blocks: string; mostNamespaces: number }> {
  const modules = Object.entries(config.modules)
  const yaml = modules.map(([name, module]) => `  ${name}:\n${renderModule(module)}`).join('\n\n')

  const detected: string[] = []
  let mostNamespaces = 0

  for (const [name, module] of modules) {
    const rm = await createResourceManager(platform, module)
    const prefix = modules.length > 1 ? `${name}: ` : ''

    const locales = rm?.allLocales ?? []
    if (locales.length) detected.push(`${prefix}locales: ${locales.join(', ')}`)

    // By name, since this list is the scope of every command and a glob is not one. Capped only so
    // a project with a file per locale-namespace pair cannot bury the rest of the briefing.
    const files = [...(rm?.getFileLocaleMap().keys() ?? [])]
    if (files.length) detected.push(`${prefix}translation files: ${collapsePaths(files, MAX_FILES_LISTED)}`)

    // Stated either way: "no namespaces" is the fact that stops a key being qualified with one.
    const namespaces = (rm?.namespaces ?? []).filter((ns) => ns !== NS_WITHOUT_NS)
    mostNamespaces = Math.max(mostNamespaces, namespaces.length)
    detected.push(`${prefix}namespaces: ${namespaces.length ? namespaces.join(', ') : 'none'}`)
  }

  // Said here rather than left to the first command that refuses: with one module nothing has to
  // be chosen, so the flag is never mentioned to a project that has no use for it.
  if (modules.length > 1) {
    detected.push(`\nEvery command needs --module, since this project has more than one.`)
  }

  return { blocks: `modules:\n${yaml}\n\n${detected.join('\n')}`, mostNamespaces }
}

/** The binary ships inside the plugin, so its own path is the only way to run it. */
function whereTheBinaryIs(bin: string): string {
  return `Run loccy-tool by its full path: ${bin}`
}

/**
 * What a session opens on: the tool it operates i18n through, and what this project resolves to.
 * A project with no `loccy.yaml` is told only where the binary is, so the plugin stays close to
 * invisible where it has nothing to say, while setup can still be run.
 */
export async function buildStartupContext(platform: Platform, bin: string): Promise<string> {
  const config = await readConfigFile(platform)
  if (!config) return whereTheBinaryIs(bin)

  const { blocks, mostNamespaces } = await describeSetup(platform, config)
  const sections = [`## This project uses i18n\n\n${blocks}`, whereTheBinaryIs(bin), workflow(bin)]

  const dropped = droppedStyleguideNote(config)
  if (dropped) sections.push(dropped)

  // Only the several-namespace case changes how a command is called: one namespace is picked on
  // its own, and none leaves nothing to pick.
  if (mostNamespaces > 1) {
    sections.push('Project uses several namespaces, so --ns is required on every command that takes it.')
  } else if (!mostNamespaces) {
    sections.push("Project doesn't use namespaces, never pass --ns.")
  }

  return sections.join('\n\n')
}
