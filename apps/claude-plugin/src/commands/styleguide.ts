import { loccyConfigFilename } from '@repo/types/config.types'
import { renderStyleguideYaml } from '@repo/shared/core/loccy-config/config-templates'
import { STYLEGUIDE_EXAMPLE_YAML } from '@repo/shared/core/loccy-config/styleguide-example'
import { loadConfig } from '../context'
import { droppedStyleguideNote, hasStyleguideRules, printHandshake, styleguidedFlag } from '../styleguide-output'

const NO_STYLEGUIDE = `No styleguide in ${loccyConfigFilename} yet, so nothing constrains the copy beyond the corpus itself.

Match the tone of the existing messages, and offer to author one if the user keeps correcting the
same things: the author-styleguide skill covers it.`

/**
 * A worked styleguide to author against, which a project whose own is still empty has nothing else
 * to look at. Every field and every value shape appears exactly once, so it stands in for the
 * schema without anyone having to read one.
 */
export function styleguideExampleCommand(): void {
  console.log(STYLEGUIDE_EXAMPLE_YAML)
}

/**
 * The project's writing rules, whole and on their own, so they never have to be extracted from a
 * command that does something else. Printed as the YAML they are authored in: prose renders the
 * rules for one write, and rendering drops whatever that write has no use for, which is the wrong
 * trade for the command whose whole job is to show all of them.
 *
 * One styleguide governs the whole project, so no module is named here. The locale set a write has
 * to cover is per-module, and belongs to the command doing the writing.
 */
export async function styleguideCommand(): Promise<void> {
  const config = await loadConfig()

  // Before the rules: it says which of them are missing.
  const dropped = droppedStyleguideNote(config)
  if (dropped) console.log(`${dropped}\n`)

  if (!hasStyleguideRules(config)) {
    console.log(NO_STYLEGUIDE)
    return
  }

  console.log(`# Styleguide, as authored in ${loccyConfigFilename}\n`)
  console.log(renderStyleguideYaml(config.styleguide).trimEnd())

  // Reading this is what earns the flag, so the write form belongs here as much as after the
  // styleguide a write prints for itself.
  printHandshake(
    `  loccy-tool upsert-message ${styleguidedFlag(config)} <<'EOF'\n` +
      '  {"<keypath>": {"<locale>": "<text>"}}\n' +
      '  EOF',
  )
}
