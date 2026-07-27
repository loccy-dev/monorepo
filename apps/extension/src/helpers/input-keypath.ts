import * as vscode from 'vscode'
import { Command, ControlledQuickPicker, QuickPickConfig, QuickPickControls } from './controlled-quick-picker'
import { handleError } from './error-handler'
import type { Namespace } from '@repo/types/primitives.types'
import { resourceService } from './resource-service'
import { LucideIcon } from '../lucide-icons'

type InputKeypathProps = {
  type: KeypathInputType
  initValue?: string
  createKeypathPromise?: Promise<string | null>
  namespace?: Namespace
  prefix?: string
  /** Module the keypath belongs to — scopes validation + suggestions to that module. */
  moduleName?: string
}

export enum KeypathInputType {
  Create = 'Create',
  Update = 'Update',
}

enum Step {
  Start = 'Start',
}

export let keypathQuickPick: ControlledQuickPicker<Step> | null = null

export async function inputKeypath({
  type,
  initValue,
  createKeypathPromise,
  namespace,
  prefix,
  moduleName,
}: InputKeypathProps) {
  const displayLocale =
    (moduleName ? resourceService.view(moduleName)?.displayLocale : undefined) ?? resourceService.displayLocale
  const saveKeypathItem: Command<Step> = {
    icon: LucideIcon.CHECK,
    label: '', // overridden later
    detail: type === KeypathInputType.Create ? 'Save and review translations' : 'Save and update everywhere',
    action: () => {}, // overridden later
    alwaysShow: true,
    picked: true,
  }

  const getCommandItems = (value: string, resolve: (value: string) => void): Command<Step>[] => {
    const trimmed = value.trim()
    const newItems: Command<Step>[] = []

    if (trimmed) {
      const validationError = newKeypathValidationError(trimmed, initValue, namespace, prefix, moduleName)
      newItems.push({
        ...saveKeypathItem,
        label: trimmed,
        detail: validationError ? `⚠️ ${validationError}` : saveKeypathItem.detail,
        action: (controls: QuickPickControls<Step>) => {
          if (validationError) {
            vscode.window.showWarningMessage(validationError)
            return
          }
          resolve(controls.inputValue.trim())
          controls.dispose()
        },
      })
    } else {
      // do not show "save" btn if empty
    }

    const suggestions = resourceService.getKeypathSuggestions(trimmed, displayLocale, namespace, moduleName)
    newItems.push(
      ...suggestions.map((suggestion) => ({
        icon: suggestion.hasChildren ? LucideIcon.BRACES : LucideIcon.KEY_ROUND,
        label: suggestion.keypath,
        description: suggestion.value,
        action: (controls: QuickPickControls<Step>) => {
          controls.setInputValue(suggestion.keypath + (suggestion.hasChildren ? '.' : ''))
        },
      })),
    )

    return newItems
  }

  return await new Promise<string | null>((resolve, reject) => {
    // prettier-ignore
    const quickPickConfig: QuickPickConfig<Step> = {
      [Step.Start]: {
        title: type === KeypathInputType.Create ? 'Create keypath for new entry' : 'Edit keypath',
        placeholder: 'new.keypath.name',
        inputValue: !createKeypathPromise && initValue ? initValue : '',
        commands: (controls: QuickPickControls<Step>) => getCommandItems(controls.inputValue, resolve),
      },
    }

    const quickPick = new ControlledQuickPicker(quickPickConfig)
    keypathQuickPick = quickPick

    if (createKeypathPromise) {
      quickPick.controls.setLoading(true)

      createKeypathPromise
        .then((val) => {
          const trimmed = val?.trim()
          if (!trimmed) {
            handleError({
              internal: `Empty keypath suggested`,
              snackbar: 'Suggested keypath is invalid, please enter manually',
            })
            return
          }
          quickPick.controls.setLoading(false)
          quickPick.controls.setInputValue(trimmed)
        })
        .catch((e) => {
          quickPick.controls.setLoading(false)
        })
    }

    // Esc press
    quickPick.onDidHideCallback = () => {
      keypathQuickPick = null
      resolve(null)
    }
  })
}

function newKeypathValidationError(
  keypath: string,
  renamedFrom: string | undefined,
  namespace?: Namespace,
  prefix?: string,
  moduleName?: string,
): string | undefined {
  const endsWithDot = keypath.endsWith('.')
  if (endsWithDot) {
    return 'Keypath cannot end with dot'
  }

  if (prefix && !keypath.startsWith(prefix + '.')) {
    return `Keypath must start with prefix "${prefix}."`
  }

  const existingKeypaths = Object.keys(resourceService.getFlatTranslationsPerKeypath(namespace, moduleName))
  const alreadyExists = existingKeypaths.includes(keypath)

  if (alreadyExists) {
    return 'Keypath already exists'
  }

  if (resourceService.keypathStructure(namespace, moduleName) === 'flat') {
    if (!alreadyExists) {
      return
    }
  }

  const nestingInsideString = existingKeypaths.find(
    (existingKey) => keypath.startsWith(existingKey + '.') && (!renamedFrom || existingKey !== renamedFrom),
  )
  if (nestingInsideString) {
    return 'Can not nest inside existing keypath'
  }

  const usingParent = existingKeypaths.find((existingKey) => existingKey.startsWith(keypath + '.'))
  if (usingParent) {
    return 'Can not use parent node as new keypath'
  }
}
