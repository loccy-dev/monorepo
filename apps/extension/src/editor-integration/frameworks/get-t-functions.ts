import * as vscode from 'vscode'
import type { TFunctionInfo } from '@repo/types/framework.types'
import { getFrameworkExtension } from './registry'
import { resourceService } from '../../helpers/resource-service'

/**
 * Detect t-function calls at a cursor, using the framework(s) of the module(s) that own the source
 * file — so a mixed-framework repo detects each file with its own framework, not the global preset.
 */
export function getTFunctions(
  content: string,
  fileExt: string,
  cursorOffset: number,
  sourceUri: vscode.Uri,
): TFunctionInfo[] {
  return resourceService
    .sourceScanContexts(sourceUri)
    .flatMap(({ view }) =>
      getFrameworkExtension(view.module.framework).getTFunctions(
        content,
        fileExt,
        cursorOffset,
        view.module.usages.customTFunctions ?? [],
        view.defaultNs,
      ),
    )
}
