import * as vscode from 'vscode'
import { reportEvent } from '../telemetry/telemetry'
import { sortLocalizedText } from '../helpers/helpers'
import { handleError } from '../helpers/error-handler'
import { TelemetryEvent } from '../telemetry/events'
import { Command, ControlledQuickPicker, QuickPickConfig, QuickPickControls } from '../helpers/controlled-quick-picker'
import { resolveInsertContext } from '../helpers/resolve-insert-context'
import { resourceService } from '../helpers/resource-service'
import { insertTFunction } from '../editor-integration/frameworks/insert-t-function'
import { parseParamNames } from '../helpers/parse-params'
import type { LocalizedText } from '@repo/types/primitives.types'
import { editWorkspaceAndSave } from '../helpers/workspace-edit'

enum Step {
  Search = 'Search',
}

export async function insertExistingMessageCmd() {
  reportEvent(TelemetryEvent.searchTranslations)

  const editor = vscode.window.activeTextEditor!
  if (!editor) {
    handleError({ snackbar: 'No active editor found', internal: 'searchTranslationsCmd' })
    return
  }

  const ctx = await resolveInsertContext(editor)
  if (!ctx) {
    return
  }
  const { tFuncInfo, ns, view } = ctx
  const moduleName = view.name
  const displayLocale = view.displayLocale ?? resourceService.displayLocale

  const quickPickConfig: QuickPickConfig<Step> = {
    [Step.Search]: {
      title: 'Search existing translations',
      placeholder: 'Search by translation or keypath',
      matchOnDetail: true,
      commands: () => {
        const translationItems: Command<Step>[] = []

        const flatTranslations = resourceService.getFlatTranslationsPerKeypath(ns, moduleName)
        const filteredEntries = tFuncInfo.tFunctionInfo?.prefix
          ? Object.entries(flatTranslations).filter(([keypath]) => keypath.startsWith(tFuncInfo.tFunctionInfo.prefix!))
          : Object.entries(flatTranslations)
        for (const [keypath, localizedText] of filteredEntries) {
          const sortedText = sortLocalizedText(localizedText)
          const displayText = sortedText[displayLocale] ? sortedText[displayLocale] : Object.values(sortedText)[0]

          translationItems.push({
            label: displayText,
            detail: keypath,
            action: (controls: QuickPickControls<Step>) => {
              useSelectedTranslation(keypath, controls, localizedText)
            },
          })
        }

        return translationItems
      },
    },
  }

  new ControlledQuickPicker(quickPickConfig)

  function useSelectedTranslation(keypath: string, controls: QuickPickControls<Step>, localizedText: LocalizedText) {
    reportEvent(TelemetryEvent.searchTranslations_done)
    controls.dispose()

    editWorkspaceAndSave(async (workspaceEdit) => {
      insertTFunction(
        workspaceEdit,
        {
          loc: {
            start: editor.document.offsetAt(editor.selection.start),
            end: editor.document.offsetAt(editor.selection.end),
            line: editor.selection.anchor.line,
          },
          keypath,
          tFunctionInfo: tFuncInfo.tFunctionInfo,
          params: parseParamNames(Object.values(localizedText), moduleName),
        },
        editor.document.uri,
      )
    })
  }
}
