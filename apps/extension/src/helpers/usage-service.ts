import * as vscode from 'vscode'
import { getSurroundingCode } from './helpers'
import type { Namespace } from '@repo/types/primitives.types'
import { fileResolver } from './file-resolver'
import { debounce } from 'lodash'
import { handleErrorDebounced } from './error-handler'
import { updateAnnotations } from '../hover/annotations'
import { resourceService } from './resource-service'
import { getKeyRanges } from '../editor-integration/frameworks/get-key-ranges'
import type { KeypathInfo } from '@repo/types/framework.types'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { renameUsageEdits } from '@repo/shared/core/usages/rename-usage'
import { usageMatchesNamespace } from '@repo/shared/core/usages/find-usages'
import { KEYS_PARSE_ON_EDIT_DEBOUNCE_DELAY } from '../config'

class UsageService {
  public initialized = false

  public perFile: Map<string, KeypathInfo[]> = new Map()

  public documentParsePromises = new Map<string, Promise<void>>()
  private documentParsePromiseIds = new WeakMap<Promise<void>, symbol>()
  private abortControllers = new Map<string, AbortController>()

  async init() {
    this.initialized = false
    this.perFile = new Map()

    const files = fileResolver.srcFileUris
    for (const file of files) {
      await this.readFileAndUpdateState(file)
    }

    this.initialized = true
  }

  getPerKeypath(namespace?: Namespace) {
    let result: Map<string, Map<string, KeypathInfo[]>> = new Map()

    for (const [stringifiedUri, keypaths] of this.perFile.entries()) {
      // Match against the OWNING module's default namespace, per file (mixed-framework repos differ).
      const fileDefaultNs =
        resourceService.resolveSourceView(vscode.Uri.parse(stringifiedUri))?.defaultNs ?? NS_WITHOUT_NS
      for (const keypathInfo of keypaths) {
        if (keypathInfo.type === 'dynamic-undefined' || !keypathInfo.keypaths.length) {
          continue
        }

        if (!usageMatchesNamespace(keypathInfo, namespace ?? fileDefaultNs, fileDefaultNs)) {
          continue
        }

        for (const keypath of keypathInfo.keypaths) {
          if (!result.has(keypath)) {
            result.set(keypath, new Map())
          }
          if (!result.get(keypath)!.has(stringifiedUri)) {
            result.get(keypath)!.set(stringifiedUri, [])
          }
          result.get(keypath)!.get(stringifiedUri)!.push(keypathInfo)
        }
      }
    }

    return result
  }

  async getCodeContextForKeypath(keypath: string, namespace?: string) {
    const locations = this.getPerKeypath(namespace).get(keypath)
    if (!locations) {
      return
    }

    const contexts: string[] = []

    for (const [stringifiedUri, keyInfos] of locations) {
      for (const keyInfo of keyInfos) {
        const codeContext = await getSurroundingCode(vscode.Uri.parse(stringifiedUri), keyInfo.loc.line)
        if (codeContext) {
          contexts.push(codeContext)
        }
      }
    }

    if (!contexts.length) {
      return
    }

    return [...contexts.slice(0, 5)].join('\n\n')
  }

  async collectKeypathRenameChanges(
    workspaceEdit: vscode.WorkspaceEdit,
    oldKey: string,
    newKey: string,
    namespace?: Namespace,
  ) {
    const filesWithKeypaths = this.getPerKeypath(namespace).get(oldKey)
    if (!filesWithKeypaths) {
      return
    }

    for (const [stringifiedUri, keyInfos] of filesWithKeypaths.entries()) {
      const uri = vscode.Uri.parse(stringifiedUri)
      const document = await vscode.workspace.openTextDocument(uri)

      // Skip dynamic keys as they can't be reliably renamed
      const renamable = keyInfos.filter((keyInfo) => !keyInfo.type.startsWith('dynamic'))

      for (const edit of renameUsageEdits(renamable, newKey)) {
        const range = new vscode.Range(document.positionAt(edit.start), document.positionAt(edit.end))
        workspaceEdit.replace(uri, range, edit.text)
      }

      // internal state updates after the edit applies, via the undo/redo handler
    }
  }

  private async readFileAndUpdateState(uri: vscode.Uri, content?: string) {
    const stringifiedUri = uri.toString()

    this.abortControllers.get(stringifiedUri)?.abort()

    const controller = new AbortController()
    this.abortControllers.set(stringifiedUri, controller)

    const promiseId = Symbol()

    const currentPromise = (async () => {
      try {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        content = content ?? (await fileResolver.readFile(uri))

        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        const keypaths = content ? await getKeyRanges(content, uri) : []

        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }

        if (!keypaths.length) {
          this.perFile.delete(stringifiedUri)
        } else {
          this.perFile.set(
            stringifiedUri,
            keypaths.sort((a, b) => a.loc.line - b.loc.line),
          )
        }
      } catch (e: any) {
        if (e.name === 'AbortError') {
          throw e // Re-throw for external handlers
        } else {
          handleErrorDebounced({
            e,
            internal: `UsageService: error processing file: ${vscode.workspace.asRelativePath(uri)}`,
          })
        }
      } finally {
        // cleanup only if this is still the current operation
        const stored = this.documentParsePromises.get(stringifiedUri)
        if (stored && this.documentParsePromiseIds.get(stored) === promiseId) {
          this.documentParsePromises.delete(stringifiedUri)
        }
        if (this.abortControllers.get(stringifiedUri) === controller) {
          this.abortControllers.delete(stringifiedUri)
        }
      }
    })()

    this.documentParsePromiseIds.set(currentPromise, promiseId)
    this.documentParsePromises.set(stringifiedUri, currentPromise)

    // swallow all errors incl. aborts — no special handling needed here
    return currentPromise.catch(() => {})
  }

  public async handleFileCreate(uri: vscode.Uri): Promise<void> {
    await fileResolver.addSourceFile(uri)
    await this.readFileAndUpdateState(uri)
    updateAnnotations()
  }

  public async handleFileUpdate(uris: vscode.Uri[]): Promise<void> {
    if (uris.length === 0) {
      return
    }

    // Process files in parallel with a concurrency limit of 10
    const batchSize = 10
    for (let i = 0; i < uris.length; i += batchSize) {
      const batch = uris.slice(i, i + batchSize)
      await Promise.all(batch.map((uri) => this.readFileAndUpdateState(uri)))
    }

    updateAnnotations()
  }

  public async onDocumentChange(uri: vscode.Uri, content: string) {
    this.debouncedHandleDocumentChange(uri, content)
  }

  private debouncedHandleDocumentChange = debounce(
    this.handleDocumentChange.bind(this),
    KEYS_PARSE_ON_EDIT_DEBOUNCE_DELAY,
  )

  private async handleDocumentChange(uri: vscode.Uri, content: string) {
    await this.readFileAndUpdateState(uri, content)
  }

  public async handleFilesDelete(uris: vscode.Uri[]): Promise<void> {
    if (uris.length === 0) {
      return
    }

    for (const uri of uris) {
      await fileResolver.removeSourceFile(uri)

      const stringifiedUri = uri.toString()

      this.abortControllers.get(stringifiedUri)?.abort()
      this.abortControllers.delete(stringifiedUri)
      this.documentParsePromises.delete(stringifiedUri)

      this.perFile.delete(stringifiedUri)
    }

    updateAnnotations()
  }
}

export const usageService = new UsageService()
