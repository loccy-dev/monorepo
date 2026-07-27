import * as vscode from 'vscode'
import { Logger } from './helpers/logger'
import { UserSettings } from './settings/user-settings.types'
import { fileResolver } from './helpers/file-resolver'
import { detectDefaultsUseDoubleQuotes } from './helpers/detect-defaults/detect-default-double-quotes'
import { createVscodePlatform } from './helpers/vscode-platform'
import { readConfigOrDetect } from '@repo/shared/core/loccy-config/loccy-config'
import { allSupportedLanguages as sharedAllSupportedLanguages } from '@repo/shared/core/config'
import { type LoccyConfig, type ResolvedModule, type StyleguideConfig } from '@repo/types/config.types'

class GlobalConfig {
  public isMacOs = process.platform === 'darwin'
  public settings: UserSettings

  /** Hand-authored AI guidance (glossary + do-not-translate + partial-override rules nested inside). */
  public styleguide?: StyleguideConfig

  /** Shared-resolved project config — the sole source of mechanical i18n config. Null if nothing resolves. */
  public resolvedConfig: LoccyConfig | null = null

  get modules(): ResolvedModule[] {
    return this.resolvedConfig ? Object.values(this.resolvedConfig.modules) : []
  }

  /** The primary module — `default`, else the first — for single-value fallbacks. */
  get primaryModule(): ResolvedModule | undefined {
    return this.resolvedConfig?.modules.default ?? this.modules[0]
  }

  /** Union of every module's translation glob/exclude — for file watching/collection across the whole project. */
  get resourceGlobs(): { include: string[]; exclude: string[] } {
    const modules = this.modules
    return {
      include: [...new Set(modules.map((m) => m.translations.glob))],
      exclude: [...new Set(modules.flatMap((m) => m.translations.exclude ?? []))],
    }
  }

  /** Union of every module's usage include/exclude — for file watching/collection across the whole project. */
  get usageGlobs(): { include: string[]; exclude: string[] } {
    const modules = this.modules
    return {
      include: [...new Set(modules.flatMap((m) => m.usages.include))],
      exclude: [...new Set(modules.flatMap((m) => m.usages.exclude ?? []))],
    }
  }

  allSupportedLanguages = sharedAllSupportedLanguages

  constructor() {
    this.settings = this.loadSettings()
  }

  /** The extension's own vscode user preferences (defaults come from `package.json > contributes.configuration`). */
  private loadSettings(): UserSettings {
    return vscode.workspace.getConfiguration().get<UserSettings>('loccy')!
  }

  get webAppDomain() {
    return process.env.LOCCY_LOCAL_WEB ? 'http://localhost:3000' : 'https://loccy.dev'
  }

  async init(context: vscode.ExtensionContext): Promise<boolean> {
    this.settings = this.loadSettings()

    const platform = createVscodePlatform()
    if (!platform) {
      Logger.info('No workspace open, init cancelled')
      return false
    }

    try {
      this.resolvedConfig = await readConfigOrDetect(platform)
    } catch (e) {
      Logger.info(`Failed to resolve project config: ${e instanceof Error ? e.message : 'unknown error'}`)
      this.resolvedConfig = null
    }

    if (!this.resolvedConfig) {
      Logger.info('No resource files found, init cancelled')
      return false
    }
    const resolvedConfig = this.resolvedConfig

    await fileResolver.init(
      this.resourceGlobs.include,
      this.resourceGlobs.exclude,
      this.usageGlobs.include,
      this.usageGlobs.exclude,
    )

    const translationFileUris = await fileResolver.getFileUris(this.resourceGlobs.include, this.resourceGlobs.exclude)
    if (!translationFileUris.length) {
      Logger.info('No resource files collected, init cancelled')
      return false
    }

    // Quote style: the shared resolver never attempts this detection — an IDE-only, project-wide heuristic.
    for (const module of Object.values(resolvedConfig.modules)) {
      if (module.usages.quoteType === undefined) {
        module.usages.quoteType = (await detectDefaultsUseDoubleQuotes()) ? 'double' : 'single'
      }
    }

    this.styleguide = resolvedConfig.styleguide

    return true
  }

  async setSourceLocale(locale: string, target: vscode.ConfigurationTarget) {
    const configuration = vscode.workspace.getConfiguration('loccy')
    await configuration.update('sourceLocale', locale, target)
  }
}

export const cfg = new GlobalConfig()
