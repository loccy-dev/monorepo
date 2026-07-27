import * as vscode from 'vscode'
import { InsertTFunctionProps } from '../../types'
import { getFrameworkExtension } from './registry'
import { resourceService } from '../../helpers/resource-service'
import { handleError } from '../../helpers/error-handler'
import { NO_OWNING_MODULE_MESSAGE } from '../../helpers/resolve-insert-context'

export async function insertTFunction(
  workspaceEdit: vscode.WorkspaceEdit,
  props: Omit<InsertTFunctionProps, 'quoteType'>,
  sourceUri: vscode.Uri,
): Promise<void> {
  // Insert with the OWNING module's framework + quote style — the module whose `usages.include`
  // claims this file. A file no module claims is an error, not a silent insert into the first module.
  const view = resourceService.resolveSourceView(sourceUri)
  if (!view) {
    handleError({ snackbar: NO_OWNING_MODULE_MESSAGE, internal: 'insertTFunction: no owning module' })
    return
  }
  await getFrameworkExtension(view.module.framework).insertTFunction(workspaceEdit, {
    ...props,
    quoteType: view.module.usages.quoteType ?? 'double',
  })
}
