import * as vscode from 'vscode'
import * as path from 'path'
import { cfg } from './global-config'
import { extractAndTranslateCmd } from './commands/extract-and-translate-cmd'
import { registerAnnotations, updateAnnotations } from './hover/annotations'
import { editTranslationCmd } from './hover/edit-translation-cmd'
import { registerVirtualSystemProvider } from './helpers/virtual-file-system-provider'
import { usageService } from './helpers/usage-service'
import { actionsWithTranslationsCmd } from './hover/actions-with-translations-cmd'
import { handleAuthCallbackUri, initializeAuth, signOut } from './helpers/auth/auth'
import {
  getInstallationDate,
  LifecycleEvent,
  reportEvent,
  reportLifecycleEvent,
  setInstallationDate,
} from './telemetry/telemetry'
import { createConfigFileCmd } from './commands/create-config-file-cmd'
import { openConfigCmd } from './commands/open-config-cmd'
import { fileResolver, FileType } from './helpers/file-resolver'
import { gitignoreHelper } from './helpers/gitignore-helper'
import { insertExistingMessageCmd } from './commands/insert-existing-message-cmd'
import { TelemetryEvent } from './telemetry/events'
import { openLocCmd } from './hover/open-loc-cmd'
import { suggestContextualTranslationCmd } from './commands/suggest-contextual-translation-cmd'
import { ReleasesManager } from './helpers/releases-manager'
import { resourceService } from './helpers/resource-service'
import { WatcherManager } from './helpers/watcher/watcher-manager'
import { findLegacyJsonConfig, hasYamlConfig, migrateJsonConfig } from './settings/migrate-json-config'
import { loccyConfigFilename } from '@repo/types/config.types'
import { handleError } from './helpers/error-handler'

export let extensionContext: vscode.ExtensionContext
let watcherManager: WatcherManager | null = null

/** Offer to migrate a legacy `loccy.config.json` to yaml (config + styleguide). Json-only projects. */
async function suggestJsonMigration(reinit: () => Promise<void>) {
  const jsonUri = await findLegacyJsonConfig()
  if (!jsonUri || (await hasYamlConfig())) {
    return
  }

  reportEvent(TelemetryEvent.migrateJsonConfig_suggested)

  const choice = await vscode.window.showInformationMessage(
    'Loccy now configures via loccy.yaml. Migrate your legacy loccy.config.json?',
    'Migrate',
  )
  if (choice !== 'Migrate') {
    return
  }

  await runJsonMigration(jsonUri, reinit)
}

// TEMP(JSON-CONFIG-MIGRATION): manual command palette entry point for users who dismissed the auto-suggestion above. Remove both once json configs are gone from the wild.
async function migrateJsonConfigCmd(reinit: () => Promise<void>) {
  const jsonUri = await findLegacyJsonConfig()
  if (!jsonUri) {
    vscode.window.showInformationMessage('No loccy.config.json found.')
    return
  }
  if (await hasYamlConfig()) {
    vscode.window.showInformationMessage('loccy.yaml already exists — nothing to migrate.')
    return
  }

  await runJsonMigration(jsonUri, reinit)
}

async function runJsonMigration(jsonUri: vscode.Uri, reinit: () => Promise<void>) {
  try {
    const { migratedAiInstructions } = await migrateJsonConfig(jsonUri)
    await reinit()
    const configDoc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(jsonUri, '..', loccyConfigFilename))
    await vscode.window.showTextDocument(configDoc)
    reportEvent(TelemetryEvent.migrateJsonConfig_done, { migratedAiInstructions: String(migratedAiInstructions) })
    vscode.window.showInformationMessage('Migrated to loccy.yaml.')
  } catch (e) {
    reportEvent(TelemetryEvent.migrateJsonConfig_failed, { error: e instanceof Error ? e.message : 'unknown' })
    handleError({
      e,
      internal: 'loccy.config.json → yaml migration failed',
      snackbar: 'Migration failed. Please try again.',
    })
  }
}

// prettier-ignore
export async function activate(context: vscode.ExtensionContext) {
  // Dev-only: load a gitignored repo-root .env so maintainers can override env vars. No-op in production.
  if (process.env.LOCCY_DEBUG) {
    const { config } = await import('dotenv')
    config({ path: path.resolve(context.extensionPath, '../..', '.env') })
  }
  extensionContext = context

  // initial telemetry
  // context.subscriptions.push(initializeReporter())
  const isFirstInstall = !getInstallationDate(context)
  if (isFirstInstall) {
    reportEvent(TelemetryEvent.install)
    setInstallationDate(context)
  }
  reportEvent(TelemetryEvent.launch, undefined)

  await gitignoreHelper.init()
  reportEvent(TelemetryEvent.initGitignore)

  // auth
  initializeAuth(context)
  context.subscriptions.push(
    vscode.window.registerUriHandler({
      handleUri: async (uri) => handleAuthCallbackUri(uri),
    }),
  )

  await cfg.init(context)
  reportEvent(TelemetryEvent.initConfig)

  reportEvent(TelemetryEvent.initFileResolver)

  await resourceService.init()
  reportEvent(TelemetryEvent.initResourceService)
  if (fileResolver.translationFileUris.length) {
    vscode.commands.executeCommand('setContext', 'loccy.showContextMenuItems', true)
    reportEvent(TelemetryEvent.detectResources, {locales: resourceService.allLocales.join(',')})
  } else {
    vscode.commands.executeCommand('setContext', 'loccy.showContextMenuItems', false)
  }

  usageService.init().then(() => {
    reportEvent(TelemetryEvent.initUsageService)
    updateAnnotations()
  })

  // file watcher
  watcherManager = new WatcherManager()
  watcherManager.setResourceServiceHandlers({
    onCreate: (uri) => resourceService.handleFileCreate(uri),
    onUpdate: (uris) => resourceService.handleFileUpdate(uris),
    onDelete: (uris) => resourceService.handleFileDelete(uris),
  })
  watcherManager.setUsageServiceHandlers({
    onCreate: (uri) => usageService.handleFileCreate(uri),
    onUpdate: (uris) => usageService.handleFileUpdate(uris),
    onDelete: (uris) => usageService.handleFilesDelete(uris),
  })
  await watcherManager.initialize()

  const reinit = async () => {
    await cfg.init(context)
    await resourceService.init()
    usageService.init().then(() => updateAnnotations())
    
    // Reinitialize WatcherManager with updated configuration
    if (watcherManager) {
      await watcherManager.reinitialize()
    }
  }

  registerAnnotations(context)
  registerVirtualSystemProvider() // for "edit as JSON" command

  // Legacy config: one-time suggestion to migrate loccy.config.json → yaml (only place we read the json)
  void suggestJsonMigration(reinit)

  const resourcesGuard = () => {
    if (resourceService.allLocales.length === 0) {
      const buttonLabel = 'Create config file'
      vscode.window.showErrorMessage('No i18n resources found. Create configuration?', buttonLabel)
        .then(selection => {
          if (selection === buttonLabel) {
            createConfigFileCmd()
          }
      })
      return false
    }
    return true
  }

  // Localization - from editor

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.extractAndTranslate', () => resourcesGuard() && extractAndTranslateCmd())
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.insertExistingMessage', () => resourcesGuard() && insertExistingMessageCmd())
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.suggestContextualTranslation', () => resourcesGuard() &&  suggestContextualTranslationCmd()),
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.createConfigFile', createConfigFileCmd),
    vscode.commands.registerCommand('loccy.openConfig', openConfigCmd),
  )

  context.subscriptions.push(
    // TEMP(JSON-CONFIG-MIGRATION): remove command registration once json configs are gone from the wild.
    vscode.commands.registerCommand('loccy.migrateJsonConfig', () => migrateJsonConfigCmd(reinit))
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.signOut', () => signOut())
  )

  // Localization - from hover menu

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.openLoc', (args) => openLocCmd(context, args))
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.editTranslation', (args) => editTranslationCmd(args))
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('loccy.actionsWithTranslations', (args) => actionsWithTranslationsCmd(context, args))
  )

  // Watchers

  // Watch for config changes — loccy.yaml (+ legacy loccy.config.json)
  const configWatcher = vscode.workspace.createFileSystemWatcher(
    '**/loccy.{yaml,config.json}',
  )
  context.subscriptions.push(
    configWatcher,
    configWatcher.onDidChange(async () => await reinit()),
    configWatcher.onDidCreate(async () => await reinit()),
    configWatcher.onDidDelete(async () => await reinit()),
  )

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('loccy')) {
        await reinit()
      }
    }),
    vscode.workspace.onDidChangeTextDocument(async (e) => {
      const uri = e.document.uri
      const fileType = fileResolver.checkFileType(uri)
      
      // NOTE: ignore if resources, we don't want dirty changes there; it has it's own disk write FileWatcher
      if (fileType === FileType.Source) {
        usageService.onDocumentChange(uri, e.document.getText())
      }
    }),
  )

  if (isFirstInstall) {
    reportLifecycleEvent(LifecycleEvent.install, {
      uriScheme: vscode.env.uriScheme,
      resourceFiles: fileResolver.translationFileUris.join(','),
    })
  }

  const releases = new ReleasesManager(context, 'loccy.loccy')
  releases.checkForUpdates()
}

export function deactivate() {
  // Dispose WatcherManager before other cleanup
  if (watcherManager) {
    watcherManager.dispose()
    watcherManager = null
  }
}
