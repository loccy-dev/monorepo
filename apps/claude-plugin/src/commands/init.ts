import { loccyConfigFilename } from '@repo/types/config.types'
import { LOCCY_SCHEMA_URL } from '@repo/shared/core/config'
import { initializeConfigFiles } from '@repo/shared/core/loccy-config/initialize-config'
import { fail, loadPlatform } from '../context'

/**
 * Scaffold the config, and only that: every other command reads the file, so the one thing a
 * project without it can do is create it. An existing file is never touched, since it is the
 * project's own contract and auto-detection would only guess at it.
 */
export async function initCommand(): Promise<void> {
  const platform = loadPlatform()

  if (await platform.exists(loccyConfigFilename)) {
    fail(
      `${loccyConfigFilename} already exists. Edit it directly, against the field reference at\n` +
        `${LOCCY_SCHEMA_URL}. The session briefing shows what the file resolves to.`,
    )
  }

  const { usedPlaceholder } = await initializeConfigFiles(platform)

  console.log(`created ${loccyConfigFilename}`)
  console.log(
    usedPlaceholder
      ? `\nNothing could be auto-detected, so it holds placeholders. Fill in the default module\n` +
          `(framework, usages.include, translations.glob) before running anything else.`
      : `\nIt was written from auto-detection, which guesses. Check every field against the real repo:\n` +
          `framework, source globs, translation glob, layout, locales. Then author the styleguide.`,
  )
}
