import * as vscode from 'vscode'
import { ControlledQuickPicker, QuickPickConfig } from './controlled-quick-picker'
import { resourceService } from './resource-service'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import type { Namespace } from '@repo/types/primitives.types'
import type { TFunctionInfo } from '@repo/types/framework.types'

type Result = {
  ns: Namespace
  rejected: boolean
}

/**
 * Resolve the namespace for a t-function call in `sourceUri`. Namespace choices are scoped to the
 * module(s) that own the source file, so a single-namespace module auto-selects and no foreign
 * module's namespace is offered.
 */
export async function getOrSelectNamespace(tFuncInfo: TFunctionInfo | null, sourceUri: vscode.Uri): Promise<Result> {
  const defaultNs = resourceService.resolveView({ sourceUri })?.defaultNs ?? NS_WITHOUT_NS

  if (tFuncInfo === null) {
    return {
      ns: defaultNs,
      rejected: false,
    }
  }

  if (tFuncInfo.ns) {
    return {
      ns: tFuncInfo.ns,
      rejected: false,
    }
  }

  // namespaces of the source file's own module(s) — not the cross-module union
  const moduleNames = resourceService.sourceModuleNames(sourceUri)
  const views = (
    moduleNames.length ? moduleNames.map((n) => resourceService.view(n)) : [resourceService.primaryView()]
  ).filter((v): v is NonNullable<typeof v> => !!v)
  const allNs = [...new Set(views.flatMap((v) => v.namespaces))]

  if (allNs.length <= 1) {
    return {
      ns: allNs[0] ?? defaultNs,
      rejected: false,
    }
  }

  return await new Promise<Result>((resolve, reject) => {
    enum Step {
      Start = 'Start',
    }

    const quickPickConfig: QuickPickConfig<Step> = {
      [Step.Start]: {
        title: 'Select Namespace',
        placeholder: `Multiple namespaces available, select which one to use:`,
        commands: allNs.map((ns) => ({
          label: ns,
          description: ns === defaultNs ? 'default' : undefined,
          action: () => {
            resolve({
              ns,
              rejected: false,
            })
          },
        })),
      },
    }

    const quickPick = new ControlledQuickPicker(quickPickConfig)
    quickPick.onDidHideCallback = () => {
      resolve({
        ns: defaultNs,
        rejected: true,
      })
    }
  })
}
