import * as vscode from 'vscode'
import { Command, ControlledQuickPicker, QuickPickConfig } from './controlled-quick-picker'
import { cfg } from '../global-config'
import { localeMatchesLanguage } from './helpers'
import { resourceService } from './resource-service'
import { LucideIcon } from '../lucide-icons'

type InputSrcLocaleOutput = {
  locale: string
  target?: vscode.ConfigurationTarget
}

enum Step {
  Start = 'Start',
  Scope = 'Scope',
}

let inputSrcLocaleQuickPick: ControlledQuickPicker<Step> | null = null

async function inputSrcLocale() {
  return await new Promise<InputSrcLocaleOutput | null>((resolve, reject) => {
    let selectedLocale = ''

    const commands: Command<Step>[] = []

    const createCommandFromLanguage = (code: string, language?: string): Command<Step> => {
      return {
        label: code,
        description: language,
        action: (controls) => {
          selectedLocale = code
          controls.goToStep(Step.Scope)
        },
      }
    }

    const projectLocales = resourceService.allLocales
    if (projectLocales.length) {
      commands.push({
        label: 'Project locales',
        kind: vscode.QuickPickItemKind.Separator,
        action: () => {},
      })
      for (const locale of projectLocales) {
        commands.push(createCommandFromLanguage(locale))
      }

      commands.push({
        label: 'Other supported languages',
        kind: vscode.QuickPickItemKind.Separator,
        action: () => {},
      })
      const supportedLanguagesWithoutProject = cfg.allSupportedLanguages.filter(
        (l) => !projectLocales.some((pl) => localeMatchesLanguage(pl, l.code)),
      )
      for (const language of supportedLanguagesWithoutProject) {
        commands.push(createCommandFromLanguage(language.code, language.name))
      }
    } else {
      for (const language of cfg.allSupportedLanguages) {
        commands.push(createCommandFromLanguage(language.code, language.name))
      }
    }

    // prettier-ignore
    const quickPickConfig: QuickPickConfig<Step> = {
      [Step.Start]: {
        title: 'Select language of the text',
        placeholder: 'en',
        commands,
        matchOnDescription: true,
      },
      [Step.Scope]: {
        backBtn: Step.Start,
        title: () => `Save '${selectedLocale}' as your default source language?`,
        placeholder: () => `Save to skip this step next time`,
        commands: [
          {
            icon: LucideIcon.ARROW_RIGHT, label: 'Skip for now',
            action: (controls) => {
              controls.dispose()
              resolve({locale: selectedLocale })
            }
          },
          {
            icon: LucideIcon.FOLDER_COG, label: 'Save for this project',
            action: (controls) => {
              controls.dispose()
              resolve({locale: selectedLocale, target: vscode.ConfigurationTarget.Workspace })
            }
          },
          {
            icon: LucideIcon.USER_COG, label: 'Save globally',
            action: (controls) => {
              controls.dispose()
              resolve({locale: selectedLocale, target: vscode.ConfigurationTarget.Global })
            }
          },
        ],
      },
    }

    const quickPick = new ControlledQuickPicker(quickPickConfig)
    inputSrcLocaleQuickPick = quickPick

    // Esc press
    quickPick.onDidHideCallback = () => {
      inputSrcLocaleQuickPick = null
      resolve(null)
    }
  })
}

export async function getSrcLocaleWithSaveSuggestion(forceSelection = false) {
  let srcLocale = cfg.settings.sourceLocale
  if (srcLocale && !forceSelection) {
    return srcLocale
  }

  const inputResult = await inputSrcLocale()
  if (!inputResult) {
    return null
  }

  srcLocale = inputResult.locale
  if (inputResult.target) {
    cfg.setSourceLocale(inputResult.locale, inputResult.target)
  }
  return srcLocale
}
