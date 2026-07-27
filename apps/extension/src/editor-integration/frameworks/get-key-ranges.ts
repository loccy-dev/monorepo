import * as vscode from 'vscode'
import type { KeypathInfo } from '@repo/types/framework.types'
import { getFramework } from '@repo/shared/core/registry'
import { customFramework } from '@repo/shared/core/frameworks/custom/index'
import { collectGenericMatches, mergeKeyInfo } from '@repo/shared/core/usages/key-detection/helpers'
import { handleMatches } from '@repo/shared/core/usages/key-detection/handle-matches'
import { DynamicKeyResolver } from '../../helpers/dynamic-key-resolver/dynamic-key-resolver'
import { resourceService } from '../../helpers/resource-service'

/**
 * Detect i18n key usages via the shared frameworks — same path as the CLI's
 * `UsageScanner.scanContent`, plus the IDE's `DynamicKeyResolver` for dynamic keys. Scans with
 * each framework whose module owns the file, tagging the owning module when frameworks disagree.
 */
export async function getKeyRanges(content: string, fileUri: vscode.Uri): Promise<KeypathInfo[]> {
  const dynamicKeyResolver = new DynamicKeyResolver(fileUri)

  const contexts = resourceService.sourceScanContexts(fileUri)
  const tagModule = contexts.length > 1
  let result: KeypathInfo[] = []
  for (const { framework: frameworkId, view } of contexts) {
    const framework = getFramework(frameworkId) ?? customFramework
    const ranges = await framework.scanContent(content, { ...view.scanContext(), dynamicKeyResolver })
    if (tagModule) {
      for (const range of ranges) {
        range.module ??= view.name
      }
    }
    result = mergeKeyInfo(result, ranges)
  }

  // Generic matches (plain strings equal to an existing keypath), scoped to the file's primary module.
  const primary = contexts[0]?.view
  if (primary && primary.module.usages.detectKeysInStrings !== false) {
    const genericMatches = await collectGenericMatches(
      content,
      Object.keys(primary.getFlatTranslationsPerKeypath()),
      async (c, regexpData, resolver, existing, checkNested) =>
        handleMatches({
          content: c,
          regexpData,
          defaultNs: primary.defaultNs,
          dynamicKeyResolver: resolver,
          existing,
          checkNested,
          messageFormat: primary.messageFormat,
        }),
    )
    result = mergeKeyInfo(result, genericMatches, true)
  }

  return result.sort((a, b) => a.loc.start - b.loc.start)
}
