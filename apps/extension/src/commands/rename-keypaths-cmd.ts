import * as vscode from 'vscode'
import type { KeypathInfo } from '@repo/types/framework.types'
import type { Namespace } from '@repo/types/primitives.types'
import { s } from '@repo/shared/core/helpers/helpers'
import { resourceService, type KeypathRename } from '../helpers/resource-service'
import { keypathValidationError } from '../helpers/input-keypath'
import { openVirtualEditor, virtualEditorSaveHint } from '../helpers/virtual-editor'
import { applyKeypathRenames, confirmDynamicUsages } from '../hover/rename-keypath-cmd'
import { reportEvent } from '../telemetry/telemetry'
import { TelemetryEvent } from '../telemetry/events'

export interface RenameTarget {
  keypath: string
  namespace: Namespace
  prefix?: string
  moduleName?: string
}

type RenamesResolution = { renames: KeypathRename[] } | { error: string; details?: string[] }

/** Opens the selected keys in a virtual editor, one per line; saving renames each key to its edited line. */
export async function renameKeypathsCmd(keypathInfos: KeypathInfo[]) {
  reportEvent(TelemetryEvent.renameKeypaths)

  const staticInfos = keypathInfos.filter(({ type }) => type === 'static')
  const skipped = keypathInfos.length - staticInfos.length
  if (skipped) {
    vscode.window.showWarningMessage(`Skipped ${skipped} dynamic key${s(skipped)}, rename them one by one`)
  }

  const targets = uniqueTargets(staticInfos)
  if (!targets.length) {
    return
  }

  if (!(await confirmDynamicUsages(targets))) {
    return
  }

  await openVirtualEditor({
    fileName: 'Rename keys.txt',
    language: 'plaintext',
    content: [
      `// ${virtualEditorSaveHint()}`,
      '// One key per line, in the original order. Adding or removing lines is rejected.',
      '',
      ...targets.map(({ keypath }) => keypath),
    ].join('\n'),
    onSave: async (text) => {
      const resolution = resolveKeypathRenames(targets, text)
      if ('error' in resolution) {
        vscode.window.showErrorMessage(resolution.error, { modal: true, detail: resolution.details?.join('\n') })
        return false
      }

      const { renames } = resolution
      if (!renames.length) {
        vscode.window.showInformationMessage('No changes detected')
        return true
      }

      if (!(await applyKeypathRenames(renames))) {
        return false
      }
      vscode.window.showInformationMessage(`Renamed ${renames.length} key${s(renames.length)}`)
      reportEvent(TelemetryEvent.renameKeypaths_done, { count: String(renames.length) })
      return true
    },
  })
}

function uniqueTargets(keypathInfos: KeypathInfo[]): RenameTarget[] {
  const targets = new Map<string, RenameTarget>()
  for (const { keypaths, content, ns, prefix } of keypathInfos) {
    const keypath = keypaths[0] ?? content
    targets.set(`${ns}:${keypath}`, {
      keypath,
      namespace: ns,
      prefix,
      moduleName: resourceService.resolveViewForActiveEditor(keypath, ns)?.name,
    })
  }
  return [...targets.values()]
}

/** Maps edited lines back to `targets` by position; rejects the whole batch on any invalid key. */
export function resolveKeypathRenames(targets: RenameTarget[], text: string): RenamesResolution {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('//'))

  if (lines.length !== targets.length) {
    return {
      error: `Expected ${targets.length} key${s(targets.length)}, got ${lines.length}`,
      details: ['Keep one key per line, in the original order.'],
    }
  }

  const changed = targets
    .map((target, i) => ({ target, to: lines[i]! }))
    .filter(({ target, to }) => target.keypath !== to)

  const errors = new Set<string>()
  for (const { target, to } of changed) {
    const { keypath, namespace, prefix, moduleName } = target
    const sameScope = (other: RenameTarget) => other.namespace === namespace && other.moduleName === moduleName
    const otherNewKeypaths = changed.filter((other) => other.target !== target && sameScope(other.target))

    const error = keypathValidationError(to, {
      existingKeypaths: [
        ...Object.keys(resourceService.getFlatTranslationsPerKeypath(namespace, moduleName)),
        ...otherNewKeypaths.map((other) => other.to),
      ],
      structure: resourceService.keypathStructure(namespace, moduleName),
      renamedFrom: keypath,
      prefix,
    })
    if (error) {
      errors.add(`${keypath} → ${to}: ${error}`)
    }
  }

  if (errors.size) {
    return { error: `Can't rename: ${errors.size} invalid key${s(errors.size)}`, details: [...errors] }
  }

  return {
    renames: changed.map(({ target, to }) => ({
      from: target.keypath,
      to,
      namespace: target.namespace,
      moduleName: target.moduleName,
    })),
  }
}
