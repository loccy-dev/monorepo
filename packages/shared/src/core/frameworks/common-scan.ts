// Shared scan loop for frameworks whose usages are a flat list of candidate t-function names,
// each matched independently and merged. Frameworks with extra syntax beyond name(...) calls run
// their own matcher and call `handleMatches` directly instead.

import type { KeypathInfo, TFunctionInfo } from '@repo/types/framework.types'
import { handleMatches } from '../usages/key-detection/handle-matches'
import { mergeKeyInfo } from '../usages/key-detection/helpers'
import type { TFuncRegexData } from '../usages/key-detection/types'
import type { FrameworkScanContext } from '../contracts'

/** One `handleMatches` pass merged onto the running result — repeated for each t-function name or syntax variant a framework scans. */
export async function runMatchPass(
  keyInfos: KeypathInfo[],
  content: string,
  ctx: FrameworkScanContext,
  regexpData: TFuncRegexData,
  { checkNested, tFuncInfo }: { checkNested: boolean; tFuncInfo?: TFunctionInfo },
): Promise<KeypathInfo[]> {
  return mergeKeyInfo(
    keyInfos,
    await handleMatches({
      content,
      regexpData,
      defaultNs: ctx.defaultNs,
      dynamicKeyResolver: ctx.dynamicKeyResolver,
      existing: keyInfos,
      checkNested,
      messageFormat: ctx.messageFormat,
      tFuncInfo,
      allLocales: ctx.allLocales,
      existingKeypaths: ctx.existingKeypaths,
    }),
  )
}

export async function scanTFuncNames(
  content: string,
  ctx: FrameworkScanContext,
  tNames: string[],
  regexDataFor: (names: string[]) => TFuncRegexData,
): Promise<KeypathInfo[]> {
  let keyInfos: KeypathInfo[] = []

  for (const tName of new Set(tNames)) {
    keyInfos = await runMatchPass(keyInfos, content, ctx, regexDataFor([tName]), {
      checkNested: true,
      tFuncInfo: { tName },
    })
  }

  return keyInfos
}
