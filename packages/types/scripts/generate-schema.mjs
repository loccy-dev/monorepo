// Generates schemas/config.schema.json from PartialLoccyConfig (src/cfg.types.ts) — the TS
// interfaces are the source of truth, this script keeps the JSON Schema in sync at build time.
import { createGenerator } from 'ts-json-schema-generator'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import prettier from 'prettier'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, '..')
const srcDir = path.join(packageRoot, 'src')
const outFile = path.join(packageRoot, 'schemas', 'config.schema.json')

async function generate() {
  const schema = createGenerator({
    path: path.join(srcDir, 'cfg.types.ts'),
    tsconfig: path.join(packageRoot, 'tsconfig.json'),
    type: 'PartialLoccyConfig',
    expose: 'export',
    jsDoc: 'extended',
    topRef: false,
    additionalProperties: false,
    skipTypeCheck: true,
  }).createSchema('PartialLoccyConfig')

  // ts-json-schema-generator emits draft-07 shape ($schema/definitions) — normalize to the 2020-12
  // $defs convention the hand-written schema used, so refs read the same way to consumers.
  let normalized = JSON.stringify(schema).replaceAll('#/definitions/', '#/$defs/')
  const { $schema, $id, title, description, definitions, ...rest } = JSON.parse(normalized)

  // TEMP: plurals/message-format authoring isn't finalized — hide from the public schema until it
  // is (auto-detected defaults still apply at runtime). Delete this block to restore.
  delete definitions.PartialModuleConfig.properties.translations.properties.messageFormat
  delete definitions.PartialModuleConfig.properties.translations.properties.checkPlurals

  const ordered = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'config.schema.json',
    title: 'Loccy Config',
    description: 'Project config for the Loccy i18n toolchain.',
    ...rest,
    $defs: definitions,
  }

  const prettierConfig = (await prettier.resolveConfig(outFile)) ?? {}
  const formatted = await prettier.format(JSON.stringify(ordered, null, 2), { ...prettierConfig, filepath: outFile })

  await fs.writeFile(outFile, formatted)
  console.log(`Generated ${path.relative(packageRoot, outFile)}`)
}

if (process.argv.includes('--watch')) {
  await generate().catch((err) => console.error(err))

  let pending = null
  const { watch } = await import('node:fs')
  watch(srcDir, { recursive: true }, (_event, filename) => {
    if (!filename?.endsWith('.types.ts')) return
    clearTimeout(pending)
    pending = setTimeout(() => {
      generate().catch((err) => console.error(err))
    }, 150)
  })
  console.log(`Watching ${path.relative(packageRoot, srcDir)} for changes...`)
} else {
  await generate()
}
