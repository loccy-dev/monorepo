import type { ResolvedModule } from '@repo/types/config.types'
import type { I18nFrameworkId, KeypathInfo } from '@repo/types/framework.types'
import type { Platform } from '@repo/types/platform.types'
import { collectGenericMatches, mergeKeyInfo } from './key-detection/helpers'
import { handleMatches } from './key-detection/handle-matches'
import type { DynamicKeyResolverInterface } from './key-detection/types'
import { getFrameworkOrCustom, resolveActiveMessageFormat, resolveModuleTranslations } from '../registry'
import type { MessageFormat } from '../contracts'
import { collectUsedKeyDirectives, type UsedKeyDirective } from './used-key-directives'

export interface UsageScannerOptions {
  framework: I18nFrameworkId
  /** Active message format — decides how plural usages expand into keypaths. */
  messageFormat: MessageFormat
  customFunctionNames: string[]
  detectKeysInStrings: boolean
  defaultNs: string
  includePatterns: string[]
  excludePatterns: string[]
  existingKeypaths: string[] // For generic string detection
  dynamicKeyResolver: DynamicKeyResolverInterface | null
  /** Project locales — determine the CLDR categories a plural usage requires. */
  allLocales: string[]
}

export interface ScanResult {
  perFile: Map<string, KeypathInfo[]>
  /**
   * Source files the globs actually matched. Zero means nothing was looked at, which no count of
   * findings can express: `perFile` holds only the files that matched a key.
   */
  scannedFiles: number
  /** `loccy-used-keys` directives found in scanned sources, tagged with their file. */
  usedKeyDirectives: (UsedKeyDirective & { file: string })[]
}

export class UsageScanner {
  constructor(
    private readonly platform: Platform,
    private readonly options: UsageScannerOptions,
  ) {}

  /** Namespace a usage belongs to when its call site names none. */
  get defaultNs(): string {
    return this.options.defaultNs
  }

  async scan(): Promise<ScanResult> {
    const files = await this.platform.findFiles(this.options.includePatterns, this.options.excludePatterns)
    const perFile = new Map<string, KeypathInfo[]>()
    const usedKeyDirectives: ScanResult['usedKeyDirectives'] = []

    const batchSize = 10
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize)
      await Promise.all(
        batch.map(async (filePath) => {
          const { keypaths, directives } = await this.scanFile(filePath)
          if (keypaths.length) perFile.set(filePath, keypaths)
          for (const d of directives) usedKeyDirectives.push({ ...d, file: filePath })
        }),
      )
    }

    return { perFile, scannedFiles: files.length, usedKeyDirectives }
  }

  async scanFile(filePath: string): Promise<{ keypaths: KeypathInfo[]; directives: UsedKeyDirective[] }> {
    try {
      const content = await this.platform.readFile(filePath)
      return { keypaths: await this.scanContent(content), directives: collectUsedKeyDirectives(content) }
    } catch {
      return { keypaths: [], directives: [] }
    }
  }

  async scanContent(content: string): Promise<KeypathInfo[]> {
    const {
      framework: frameworkId,
      messageFormat,
      detectKeysInStrings,
      defaultNs,
      customFunctionNames,
      existingKeypaths,
      dynamicKeyResolver,
      allLocales,
    } = this.options

    const framework = getFrameworkOrCustom(frameworkId)
    let result = await framework.scanContent(content, {
      defaultNs,
      customFunctionNames,
      dynamicKeyResolver,
      messageFormat,
      allLocales,
      existingKeypaths,
    })

    // Generic matches (plain strings) — always static, so plural expansion never fires here.
    if (detectKeysInStrings && existingKeypaths?.length) {
      const genericMatches = await collectGenericMatches(
        content,
        existingKeypaths,
        async (c, regexpData, resolver, existing, checkNested) =>
          handleMatches({
            content: c,
            regexpData,
            defaultNs,
            dynamicKeyResolver: resolver,
            existing,
            checkNested,
            messageFormat,
          }),
      )
      result = mergeKeyInfo(result, genericMatches, true)
    }

    return result.sort((a, b) => a.loc.start - b.loc.start)
  }
}

export async function createUsageScanner(
  platform: Platform,
  module: ResolvedModule,
  existingKeypaths: string[],
  dynamicKeyResolver: DynamicKeyResolverInterface | null,
  allLocales: string[] = [],
): Promise<UsageScanner> {
  const { defaultNs } = await resolveModuleTranslations(platform, module)

  return new UsageScanner(platform, {
    framework: module.framework,
    messageFormat: resolveActiveMessageFormat(module),
    customFunctionNames: module.usages.customTFunctions ?? [],
    detectKeysInStrings: module.usages.detectKeysInStrings ?? true,

    defaultNs,

    includePatterns: module.usages.include,
    excludePatterns: module.usages.exclude ?? [],
    existingKeypaths,
    dynamicKeyResolver,
    allLocales,
  })
}
