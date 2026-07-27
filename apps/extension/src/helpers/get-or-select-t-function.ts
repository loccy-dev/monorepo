import * as vscode from 'vscode'
import { ControlledQuickPicker, QuickPickConfig } from './controlled-quick-picker'
import type { TFunctionInfo } from '@repo/types/framework.types'
import { getTFunctions } from '../editor-integration/frameworks/get-t-functions'

type Result = {
  tFunctionInfo: TFunctionInfo
  multipleFunctions: boolean
  rejected: boolean
}

export async function getOrSelectTFunction(
  content: string,
  ext: string,
  pos: number,
  sourceUri: vscode.Uri,
): Promise<Result> {
  let tInfos: TFunctionInfo[] = getTFunctions(content, ext, pos, sourceUri)

  if (tInfos.length === 1) {
    return {
      tFunctionInfo: tInfos[0],
      multipleFunctions: false,
      rejected: false,
    }
  }

  const positionScopedTInfos = tInfos.filter(
    (tInfo) => tInfo.start && tInfo.end && pos >= tInfo.start && pos <= tInfo.end,
  )
  if (positionScopedTInfos.length === 1) {
    return {
      tFunctionInfo: positionScopedTInfos[0],
      multipleFunctions: false,
      rejected: false,
    }
  }

  return await new Promise<Result>((resolve, reject) => {
    enum Step {
      Start = 'Start',
    }

    const config: QuickPickConfig<Step> = {
      [Step.Start]: {
        title: 'Select Translation Function',
        placeholder: `Multiple translation functions found, select which one to use:`,
        commands: tInfos.map((tInfo) => ({
          label: tInfo.tName,
          action: () => {
            resolve({
              tFunctionInfo: tInfo,
              multipleFunctions: true,
              rejected: false,
            })
          },
        })),
      },
    }

    const quickPick = new ControlledQuickPicker(config)
    quickPick.onDidHideCallback = () => {
      resolve({
        tFunctionInfo: { tName: 't' },
        multipleFunctions: true,
        rejected: true,
      })
    }
  })
}
