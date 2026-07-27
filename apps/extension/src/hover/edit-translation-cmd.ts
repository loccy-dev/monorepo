import * as vscode from 'vscode'
import { usageService } from '../helpers/usage-service'
import { aiClient } from '../api/ai-client'
import { handleAiApiError } from '../api/handle-ai-api-error'
import { handleError } from '../helpers/error-handler'
import { reportEvent } from '../telemetry/telemetry'
import { TelemetryEvent } from '../telemetry/events'
import { last } from 'lodash'
import { saveWithDiffReview, singleKeypathEntries } from '../helpers/diff-review/save-with-diff-review'
import { updateAnnotations } from './annotations'
import { getSurroundingCode, sortLocalizedText } from '../helpers/helpers'
import { ControlledQuickPicker, QuickPickConfig, QuickPickControls } from '../helpers/controlled-quick-picker'
import { AutoRefineOutput } from '@repo/types/ai-action.types'
import type { Loc } from '@repo/types/platform.types'
import type { LocalizedText, Namespace } from '@repo/types/primitives.types'
import { resourceService } from '../helpers/resource-service'
import { LucideIcon } from '../lucide-icons'

enum Step {
  Start = 'Start',
  EditManually = 'EditManually',
  PromptInput = 'PromptInput',
  PromptSelectVariant = 'PromptSelectVariant',
  PromptSaveResult = 'PromptSaveResult',
}

type PromptHistory<VariantType> = {
  prompt?: string
  answer?: VariantType[]
  selectedVariant?: VariantType
}

export type CmdEditTranslationArgs = {
  keypath: string
  locale: string
  loc: Loc
  namespace?: Namespace
}

export async function editTranslationCmd(args: CmdEditTranslationArgs) {
  reportEvent(TelemetryEvent.editTranslation)

  // the hovered file (active editor) determines which module this keypath belongs to
  const view = resourceService.resolveViewForActiveEditor(args.keypath, args.namespace)
  const moduleName = view?.name

  const translationsPerLocale = resourceService.getFlatTranslationsPerLocale(args.namespace, moduleName)
  const translationsPerKeypath = resourceService.getFlatTranslationsPerKeypath(args.namespace, moduleName)
  const currTranslationText = translationsPerLocale[args.locale]?.[args.keypath] ?? '' // empty string if t() with new key was written just now
  const allOtherLocales = (view?.allLocales ?? resourceService.allLocales).filter((l) => l !== args.locale)
  const allOtherTranslations = Object.fromEntries(
    allOtherLocales.map((l) => [l, translationsPerKeypath[args.keypath]?.[l] ?? '']),
  )
  const allOtherNonEmptyTranslations = Object.fromEntries(Object.entries(allOtherTranslations).filter(([, v]) => !!v))
  const allOthersEmpty = Object.keys(allOtherNonEmptyTranslations).length === 0
  const skipToManualEdit = !currTranslationText && allOthersEmpty

  let initialDraft = ''
  let promptHistory: PromptHistory<AutoRefineOutput[number]>[] = []

  const localeCodeFormatted = `(${args.locale})`
  const translationTitle = currTranslationText ? `${localeCodeFormatted} "${currTranslationText}"` : localeCodeFormatted

  // prettier-ignore
  const quickPickConfig: QuickPickConfig<Step> = {
    [Step.Start]: {
      title: `Edit ${translationTitle}`,
      placeholder: 'Select action',
      commands: [
        {
          icon: LucideIcon.PENCIL, label: 'Edit manually...', action: Step.EditManually
        },
        {
          icon: LucideIcon.MESSAGE_SQUARE_TEXT, label: 'Adjust with prompt...', action: Step.PromptInput,
          enabled: () => !!currTranslationText,
        },
        {
          icon: LucideIcon.LANGUAGES, label: 'Translate', description: `Fill ${localeCodeFormatted} translation based on all others`, action: autoTranslate,
          enabled: () => !currTranslationText,
        },
      ]
    },

    [Step.EditManually]: {
      backBtn: skipToManualEdit ? undefined : Step.Start,
      title: skipToManualEdit ? `Edit ${translationTitle}` : `Edit manually ${translationTitle}`,
      placeholder: 'Type the new value',
      inputValue: currTranslationText,
      // cyrillic letters on labels on purpose - so items aren't resorted on user input
      // keep in (partial) sync with PromptSaveResult step!
      commands: [
        {
          icon: LucideIcon.CHECK, label: 'Sаvе', description: localeCodeFormatted, action: save,
          alwaysShow: true,
          picked: true,
          enabled: ({ inputValue }) => !!inputValue && inputValue !== currTranslationText
        },
        {
          icon: LucideIcon.CHECK, label: 'Sаvе аs еmрtу', description: `${localeCodeFormatted} translation will be removed`, action: save,
          alwaysShow: true,
          picked: true,
          enabled: ({ inputValue }) => !inputValue && !skipToManualEdit && !!currTranslationText
        },
        {
          icon: LucideIcon.CHECK_CHECK, label: 'Sаvе аnd sync others', description: 'Auto-apply same change to all other locales', action: saveAndSyncOthers,
          alwaysShow: true,
          enabled: ({ inputValue }) => !!inputValue && inputValue !== currTranslationText && !allOthersEmpty && !!currTranslationText, // make sure we have from/to + what to sync
        },
        {
          icon: LucideIcon.LANGUAGES, label: 'Sаvе аnd trаnslаtе others', action: saveAndTranslateOthers,
          alwaysShow: true,
          enabled: ({ inputValue }) => !!inputValue && allOthersEmpty && inputValue !== currTranslationText
        },
        {
          icon: LucideIcon.SPELL_CHECK_2, label: 'Аutо-finаlizе drаft', description: 'Check grammar, style, consistency, and project rules', action: refineDraft,
          alwaysShow: true,
          enabled: ({ inputValue }) => !!inputValue && inputValue !== currTranslationText,
        },
      ]
    },

    [Step.PromptInput]: {
      backBtn: handleBackFromPromptInput,
      title: () => {
        const lastPromptingResult = last(promptHistory)?.selectedVariant?.text
        return `Tell AI what to change in ${lastPromptingResult ? `"${lastPromptingResult}"` : translationTitle}`
      },
      placeholder: 'e.g., "Shorten but keep meaning"',
      commands: [
        {
          icon: LucideIcon.SEND, label: 'Submit', action: submitPrompt,
          alwaysShow: true,
          picked: true,
          enabled: ({ inputValue }) => !!inputValue
        }
      ]
    },

    [Step.PromptSelectVariant]: {
      backBtn: handleBackFromPromptSelectVariant,
      title: 'Choose preferred option',
      placeholder: 'Choose an option for the final review',
      commands: () => {
        const lastHistoryEntry = last(promptHistory)!
        return lastHistoryEntry.answer!.map(a => ({
          label: a.text, action: (controls) => selectVariant(controls, a),
          detail: a.explanation,
        }))
      }
    },

    [Step.PromptSaveResult]: {
      backBtn: handleBackFromPromptSaveResult,
      title: 'Edit answer, if needed',
      placeholder: () => last(promptHistory)!.selectedVariant!.text,
      // cyrillic letters on labels on purpose - so items aren't resorted on user input
      // keep in (partial) sync with EditManually step!
      commands: [
        {
          icon: LucideIcon.CHECK, label: 'Sаvе', description: localeCodeFormatted, action: save,
          alwaysShow: true,
          picked: true,
          enabled: ({ inputValue }) => !!inputValue
        },
        {
          icon: LucideIcon.CHECK_CHECK, label: 'Sаvе аnd sync others', description: 'Auto-apply same change to all languages', action: saveAndSyncOthers,
          alwaysShow: true,
          enabled: ({ inputValue }) => !!inputValue && inputValue !== currTranslationText && !allOthersEmpty && !!currTranslationText, // make sure we have from/to + what to sync
        },
        {
          icon: LucideIcon.LANGUAGES, label: 'Sаvе аnd trаnslаtе others', action: saveAndTranslateOthers,
          alwaysShow: true,
          enabled: ({ inputValue }) => !!inputValue && allOthersEmpty && inputValue !== currTranslationText
        },
        {
          icon: LucideIcon.MESSAGE_SQUARE_TEXT, label: 'Рrоmрt, bаsеd оn nеw vаluе', action: reprompt,
          alwaysShow: true,
        }
      ]
    }
  }

  const quickPick = new ControlledQuickPicker(quickPickConfig)
  if (skipToManualEdit) {
    quickPick.controls.goToStep(Step.EditManually)
  }

  // HELPERS

  function handleBackFromPromptSaveResult(controls: QuickPickControls<Step>) {
    const lastHistoryEntry = last(promptHistory)!
    if (lastHistoryEntry.answer && lastHistoryEntry.answer.length > 1) {
      controls.goToStep(Step.PromptSelectVariant)
    } else {
      handleBackFromPromptSelectVariant(controls)
    }
  }

  function handleBackFromPromptSelectVariant(controls: QuickPickControls<Step>) {
    const lastHistoryEntry = last(promptHistory)!
    if (lastHistoryEntry.prompt) {
      promptHistory.pop()
      controls.goToStep(Step.PromptInput)
      controls.setInputValue(lastHistoryEntry.prompt)
    } else {
      // prompt input could be skipped in system commands: auto-translate, auto-fix, etc
      // this is always beginning of the history
      promptHistory = []
      if (initialDraft) {
        // flow started from Step.EditManually (cmd called: "refine draft")
        controls.goToStep(Step.EditManually)
        controls.setInputValue(initialDraft)
        initialDraft = ''
      } else {
        // flow started from Step.Start
        controls.goToStep(Step.Start)
      }
    }
  }

  function handleBackFromPromptInput(controls: QuickPickControls<Step>) {
    if (!promptHistory.length) {
      // entered "tell AI ..." and instanly returned back
      // OR reached end of history
      controls.goToStep(Step.Start)
      return
    }

    // subsequent prompt - need to return to last selected value edit before save
    const lastHistoryEntry = last(promptHistory)!
    controls.goToStep(Step.PromptSaveResult)
    controls.setInputValue(lastHistoryEntry.selectedVariant!.text)
  }

  async function autoTranslate(controls: QuickPickControls<Step>) {
    controls.setLoading(true)
    try {
      const codeContext = await usageService.getCodeContextForKeypath(args.keypath, args.namespace)

      // Regional override locale: its rule decides deviate-vs-inherit from parent. Route through the
      // override-aware flow so we can report the decision (incl. "no override needed").
      const overrideParent = aiClient.overrideParentFor(args.locale, Object.keys(allOtherNonEmptyTranslations))
      if (overrideParent) {
        await autoTranslateOverride(controls, codeContext, overrideParent)
        return
      }

      const response = await aiClient.translateFromOthers(
        allOtherNonEmptyTranslations,
        args.locale,
        args.keypath,
        codeContext,
      )
      const result = response?.result

      if (!result || !result.length) {
        handleError({
          snackbar: 'Invalid response, please try again',
          internal: 'translateFromOthers',
        })
        controls.goToStep(Step.Start)
        return
      }

      promptHistory.push({ answer: result })
      if (result.length === 1) {
        selectVariant(controls, result[0])
      } else {
        controls.goToStep(Step.PromptSelectVariant)
      }

      controls.setLoading(false)
    } catch (error) {
      controls.goToStep(Step.Start)
      handleAiApiError(error)
    }
  }

  // Fill a regional override locale via override resolution. Deviating → hand value to the normal
  // review/save draft; inheriting → leave empty and tell the user why (locale mirrors its parent).
  async function autoTranslateOverride(
    controls: QuickPickControls<Step>,
    codeContext: string | undefined,
    parent: string,
  ) {
    const response = await aiClient.translateMultipleFromOthers(
      allOtherNonEmptyTranslations,
      [args.locale],
      args.keypath,
      codeContext,
    )
    if (!response) {
      handleError({ snackbar: 'Invalid response, please try again', internal: 'translateMultipleFromOthers' })
      controls.goToStep(Step.Start)
      return
    }

    const value = response.result[args.locale]
    if (value) {
      promptHistory.push({ answer: [{ text: value }] })
      selectVariant(controls, { text: value })
      controls.setLoading(false)
      return
    }

    const extendsLocale = response.overrideResolutions?.find((r) => r.locale === args.locale)?.extends ?? parent
    controls.dispose()
    vscode.window.showInformationMessage(`${args.locale} inherits ${extendsLocale} — no override needed, left empty.`)
  }

  async function save(controls: QuickPickControls<Step>) {
    controls.dispose()
    reportEvent(TelemetryEvent.editTranslation_save)

    const success = await resourceService.updateValues(
      {
        [args.locale]: controls.inputValue,
      },
      args.keypath,
      args.namespace,
      moduleName,
    )

    if (!success) {
      handleError({
        snackbar: 'Failed to update translation',
        internal: 'editTranslationCmd: save - updating translation failed',
      })
      return
    }

    updateAnnotations()
    vscode.window.showInformationMessage('Message updated successfully')
  }

  async function saveAndSyncOthers(controls: QuickPickControls<Step>) {
    reportEvent(TelemetryEvent.editTranslation_saveAndUpdateOthers)
    controls.setLoading(true)

    updateAnnotations()
    try {
      const codeContext = await usageService.getCodeContextForKeypath(args.keypath, args.namespace)
      const response = await aiClient.updateOthers(
        args.locale,
        controls.inputValue,
        currTranslationText,
        allOtherTranslations,
        args.keypath,
        codeContext,
      )
      if (!response) {
        handleError({ snackbar: 'Invalid response, please try again', internal: 'updateOthers' })
        return
      }
      const newTranslations = response.result

      controls.dispose()
      saveWithDiffReview([
        {
          originalObject: singleKeypathEntries(args.keypath, allOtherTranslations),
          updatedObject: singleKeypathEntries(args.keypath, newTranslations),
          overrideResolutions: response.overrideResolutions,
          saveCallback: async (finalResult) => {
            const finalObject = {
              ...(finalResult[args.keypath] ?? {}),
              [args.locale]: controls.inputValue,
            }

            const success = await resourceService.updateValues(finalObject, args.keypath, args.namespace, moduleName)
            if (!success) {
              handleError({
                snackbar: 'Failed to update translations',
                internal: 'editTranslationCmd: saveAndSyncOthers - updating translations failed',
              })
              return
            }
            updateAnnotations()
            vscode.window.showInformationMessage('Message updated successfully')
            reportEvent(TelemetryEvent.editTranslation_saveAndUpdateOthers_done)
          },
          options: {
            title: `Review same change in other locales`,
          },
        },
      ])
    } catch (error: any) {
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }

  async function refineDraft(controls: QuickPickControls<Step>) {
    const srcText = controls.inputValue
    initialDraft = srcText
    reportEvent(TelemetryEvent.editTranslation_polishDraft, { text: srcText })
    controls.setLoading(true)

    try {
      const codeContext = await usageService.getCodeContextForKeypath(args.keypath, args.namespace)
      const response = await aiClient.autoRefine(args.locale, srcText, args.keypath, codeContext)
      const result = response?.result

      if (!result || !result.length) {
        handleError({
          snackbar: 'Invalid response, please try again',
          internal: 'autoRefine',
        })
        return
      }

      promptHistory.push({ answer: result })
      if (result.length === 1) {
        selectVariant(controls, result[0])
      } else {
        controls.goToStep(Step.PromptSelectVariant)
      }
    } catch (error: any) {
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }

  async function saveAndTranslateOthers(controls: QuickPickControls<Step>) {
    reportEvent(TelemetryEvent.editTranslation_saveAndTranslateOthers)
    controls.setLoading(true)

    updateAnnotations()
    try {
      const editor = vscode.window.activeTextEditor
      const surroundingCode = editor
        ? await getSurroundingCode(editor.document.uri, editor.selection.active.line)
        : undefined
      const response = await aiClient.translate(
        { value: controls.inputValue, params: {} },
        args.locale,
        surroundingCode,
        moduleName,
      )
      if (!response) {
        handleError({ snackbar: 'Invalid response, please try again', internal: 'translateOthers' })
        return
      }
      const result = response.result

      const translations = result.result
      controls.dispose()
      const originalObject = sortLocalizedText({
        ...allOtherTranslations,
        [args.locale]: controls.inputValue,
      })
      const getFullLocalizedText = (localized: LocalizedText, srcTranslation: string) => ({
        ...localized,
        [args.locale]: srcTranslation,
      })

      saveWithDiffReview(
        translations.map((variant, index) => {
          const description = !variant.description && index === 0 ? 'Original text' : variant.description

          return {
            originalObject: singleKeypathEntries(args.keypath, originalObject),
            updatedObject: singleKeypathEntries(
              args.keypath,
              sortLocalizedText(getFullLocalizedText(variant.translations ?? {}, variant.srcText)),
            ),
            overrideResolutions: variant.overrideResolutions,
            saveCallback: async (finalResult) => {
              const finalObject = {
                ...(finalResult[args.keypath] ?? {}),
                [args.locale]: controls.inputValue,
              }

              reportEvent(TelemetryEvent.editTranslation_saveAndTranslateOthers_done)
              const success = await resourceService.updateValues(finalObject, args.keypath, args.namespace, moduleName)
              if (!success) {
                handleError({
                  snackbar: 'Failed to update translations',
                  internal: 'editTranslationCmd: saveAndTranslateOthers - updating translations failed',
                })
                return
              }
              vscode.window.showInformationMessage('New translations saved successfully')
              updateAnnotations()
            },
            options: {
              title: `Variant ${index + 1}`,
              description,
            },
          }
        }),
        {
          usageContext: result.usageContext,
        },
      )
    } catch (error: any) {
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }

  async function submitPrompt(controls: QuickPickControls<Step>) {
    const prompt = controls.inputValue
    const valueToChange = last(promptHistory)?.selectedVariant?.text || currTranslationText
    promptHistory.push({ prompt })
    controls.setLoading(true)
    reportEvent(TelemetryEvent.editTranslation_viaPrompt, { prompt, text: valueToChange })

    try {
      const response = await aiClient.adjustOne(args.locale, prompt, valueToChange)
      const result = response?.result

      if (controls.currentStep !== Step.PromptInput) {
        // clicked back while loading
        return
      }

      if (!result || !result.length) {
        handleError({
          snackbar: 'Invalid response, please try again',
          internal: 'submitPrompt',
        })
        return
      }

      last(promptHistory)!.answer = result
      if (result.length === 1) {
        selectVariant(controls, result[0])
      } else {
        controls.goToStep(Step.PromptSelectVariant)
      }
      reportEvent(TelemetryEvent.editTranslation_viaPrompt_done)
    } catch (error: any) {
      promptHistory.pop()
      controls.setLoading(false)
      handleAiApiError(error)
    }
  }

  async function selectVariant(controls: QuickPickControls<Step>, selectedVariant: AutoRefineOutput[number]) {
    last(promptHistory)!.selectedVariant = selectedVariant
    controls.goToStep(Step.PromptSaveResult)
    controls.setInputValue(selectedVariant.text)
  }

  async function reprompt(controls: QuickPickControls<Step>) {
    controls.goToStep(Step.PromptInput)
  }
}
