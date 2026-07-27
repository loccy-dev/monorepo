import * as vscode from 'vscode'
import { updateAnnotations } from '../hover/annotations'
import { cfg } from '../global-config'
import type { Locale, Namespace, LocalizedText, Localized } from '@repo/types/primitives.types'
import { handleError } from './error-handler'
import { fileResolver } from './file-resolver'
import { ResourceManager, type KeypathSuggestion } from '@repo/shared/core/resources/resource-manager'
import {
  getFramework,
  getFrameworkOrCustom,
  resolveActiveMessageFormat,
  resolveMessageFormatId,
  resolveModuleDefaultNs,
} from '@repo/shared/core/registry'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import type { MessageFormat, FrameworkScanContext } from '@repo/shared/core/contracts'
import type { ResolvedModule } from '@repo/types/config.types'
import type { I18nFrameworkId } from '@repo/types/framework.types'
import { editWorkspaceAndSave } from './workspace-edit'
import { createVscodePlatform } from './vscode-platform'
import { minimatch } from 'minimatch'
import type { LayoutPattern } from '@repo/types/config.types'

/** A file read from disk for (re)building a module's `ResourceManager`. */
interface ModuleFile {
  uri: vscode.Uri
  relativePath: string
  content: string
}

/**
 * One config module's live resource model: a shared `ResourceManager` (locales, namespaces,
 * translations, mutations — all scoped to this module's files) plus the module's config and
 * message-format. This is the unit every read/write resolves to; two modules that share a
 * (locale, namespace) never collide because each has its own manager.
 */
export class ModuleView {
  constructor(
    public readonly name: string,
    public readonly module: ResolvedModule,
    public readonly manager: ResourceManager,
  ) {}

  /** How plurals are encoded for THIS module (drives hover completeness + value-locus parsing). */
  get messageFormat(): MessageFormat {
    return resolveActiveMessageFormat(this.module)
  }

  get defaultNs(): string {
    return this.manager.defaultNs
  }

  get allLocales(): Locale[] {
    return this.manager.allLocales
  }

  /** Preview locale scoped to this module: configured/env locale if present here, else the first. */
  get displayLocale(): Locale {
    const preview = cfg.settings.annotations.previewLocale
    if (preview && this.allLocales.includes(preview)) {
      return preview
    }
    const env = vscode.env.language
    if (env && this.allLocales.includes(env)) {
      return env
    }
    return this.allLocales[0] ?? 'en'
  }

  get namespaces(): Namespace[] {
    return this.manager.namespaces
  }

  getFlatTranslationsPerKeypath(namespace?: Namespace): Record<string, LocalizedText> {
    return this.manager.getFlatTranslationsPerKeypath(namespace)
  }

  getFlatTranslationsPerLocale(namespace?: Namespace): Localized<Record<string, string>> {
    return this.manager.getFlatTranslationsPerLocale(namespace)
  }

  getTranslationsPerLocale(namespace?: Namespace): Localized<object> {
    return this.manager.getTranslationsPerLocale(namespace)
  }

  getTranslationsPerKeypath(namespace?: Namespace): object {
    return this.manager.getTranslationsPerKeypath(namespace)
  }

  allLocalesLocalizedText(keypath: string, namespace?: Namespace): LocalizedText {
    return this.manager.allLocalesLocalizedText(keypath, namespace)
  }

  existingTranslationsLocalizedText(keypath: string, namespace?: Namespace): LocalizedText {
    return this.manager.existingTranslationsLocalizedText(keypath, namespace)
  }

  getKeypathSuggestions(input: string, displayLocale: Locale, namespace?: Namespace): KeypathSuggestion[] {
    return this.manager.getKeypathSuggestions(input, displayLocale, namespace)
  }

  get mergedFlatTranslationsPerKeypath(): Record<string, LocalizedText> {
    return this.manager.mergedFlatTranslationsPerKeypath
  }

  /** Inputs for shared `framework.scanContent` (the caller adds the IDE `dynamicKeyResolver`). */
  scanContext(): Omit<FrameworkScanContext, 'dynamicKeyResolver'> {
    return {
      defaultNs: this.defaultNs,
      customFunctionNames: this.module.usages.customTFunctions ?? [],
      messageFormat: this.messageFormat,
      allLocales: this.allLocales,
      existingKeypaths: Object.keys(this.getFlatTranslationsPerKeypath()),
    }
  }
}

/**
 * Coordinator over per-module resource models. Resolves which module a file/keypath belongs to and
 * routes reads/writes to that module's `ModuleView`. A handful of getters expose a cross-module
 * aggregate for genuinely global needs (locale pickers, project word count, glossary similarity).
 */
export class ResourceService {
  private views = new Map<string, ModuleView>()
  /** resource-file uri string → owning module name (populated as managers are built). */
  private fileToModule = new Map<string, string>()

  async init() {
    await this.rebuildAll()
    updateAnnotations()
  }

  /**
   * Testing seam: seed the model with a single in-memory module (no disk IO), so IDE unit tests can
   * set up translation data without a workspace. `globPattern`'s static prefix is stripped before
   * the layout maps each file to its locale/namespace (mirrors real construction).
   */
  setTestModule(
    files: { relativePath: string; content: string }[],
    opts: {
      layout?: LayoutPattern
      framework?: I18nFrameworkId
      defaultNs?: string
      sortKeys?: boolean
      globPattern?: string
    } = {},
  ): void {
    this.views.clear()
    this.fileToModule.clear()
    const layout = opts.layout ?? '{locale}.json'
    const framework = opts.framework ?? 'custom'
    const manager = new ResourceManager(
      {
        layout,
        defaultNs: opts.defaultNs ?? NS_WITHOUT_NS,
        sortKeys: opts.sortKeys ?? false,
        i18nFramework: framework,
        globPattern: opts.globPattern,
      },
      files,
    )
    const module: ResolvedModule = {
      name: 'default',
      framework,
      translations: {
        // per-framework default, not global preset — e.g. vue needs vue-pipe, not i18next's suffix-cldr
        messageFormat: resolveMessageFormatId(getFrameworkOrCustom(framework), new Set()),
        glob: opts.globPattern ?? '**/*.json',
        layout,
        sortKeys: opts.sortKeys ?? false,
      },
      // match any source file so this module participates in usage scanning (getKeyRanges)
      usages: { include: ['**/*'] },
    }
    this.views.set('default', new ModuleView('default', module, manager))
  }

  // --- module runtime construction ---

  /** Modules to model — the resolved shared config's. Empty when nothing resolved (`cfg.init()` already bailed in that case). */
  private runtimeModules(): ResolvedModule[] {
    return cfg.modules
  }

  private get primaryModuleName(): string | undefined {
    return cfg.primaryModule?.name ?? this.runtimeModules()[0]?.name
  }

  private matchesModuleGlob(uri: vscode.Uri, module: ResolvedModule): boolean {
    const rel = vscode.workspace.asRelativePath(uri, false)
    if (module.translations.exclude?.some((ex) => minimatch(rel, ex, { dot: true }))) {
      return false
    }
    return minimatch(rel, module.translations.glob, { dot: true })
  }

  /** Read a module's resource files (matched by its glob) from disk, first-match-wins across modules. */
  private async readModuleFiles(module: ResolvedModule, claimed?: Set<string>): Promise<ModuleFile[]> {
    const files: ModuleFile[] = []
    for (const uri of fileResolver.translationFileUris) {
      const key = uri.toString()
      if (claimed?.has(key)) {
        continue
      }
      if (!this.matchesModuleGlob(uri, module)) {
        continue
      }
      const content = (await fileResolver.readFile(uri)) ?? ''
      files.push({ uri, relativePath: vscode.workspace.asRelativePath(uri, false), content })
    }
    return files
  }

  private managerConfig(module: ResolvedModule, defaultNs: string) {
    return {
      layout: module.translations.layout,
      defaultNs,
      sortKeys: module.translations.sortKeys,
      i18nFramework: module.framework,
      globPattern: module.translations.glob,
    }
  }

  /** defaultNs: explicit config wins; the primary module reuses the proven detection; else shared detect. */
  private async resolveDefaultNs(module: ResolvedModule, relPaths: string[]): Promise<string> {
    const platform = createVscodePlatform()
    if (!platform) {
      return NS_WITHOUT_NS
    }
    return resolveModuleDefaultNs(platform, module, relPaths)
  }

  private async buildModule(module: ResolvedModule, claimed?: Set<string>): Promise<void> {
    const files = await this.readModuleFiles(module, claimed)
    const defaultNs = await this.resolveDefaultNs(
      module,
      files.map((f) => f.relativePath),
    )
    const manager = new ResourceManager(
      this.managerConfig(module, defaultNs),
      files.map((f) => ({ relativePath: f.relativePath, content: f.content })),
    )
    this.views.set(module.name, new ModuleView(module.name, module, manager))
    for (const f of files) {
      this.fileToModule.set(f.uri.toString(), module.name)
      claimed?.add(f.uri.toString())
    }
  }

  private async rebuildAll() {
    this.views.clear()
    this.fileToModule.clear()
    const claimed = new Set<string>()
    for (const module of this.runtimeModules()) {
      await this.buildModule(module, claimed)
    }
  }

  private async rebuildModules(moduleNames: Iterable<string>) {
    const byName = new Map(this.runtimeModules().map((m) => [m.name, m]))
    for (const name of new Set(moduleNames)) {
      const module = byName.get(name)
      if (!module) {
        continue
      }
      // drop this module's stale file→module entries, then rebuild from current files
      for (const [uriStr, mod] of [...this.fileToModule]) {
        if (mod === name) {
          this.fileToModule.delete(uriStr)
        }
      }
      await this.buildModule(module)
    }
  }

  // --- module resolution ---

  view(moduleName: string): ModuleView | undefined {
    return this.views.get(moduleName)
  }

  allViews(): ModuleView[] {
    return [...this.views.values()]
  }

  primaryView(): ModuleView | undefined {
    const name = this.primaryModuleName
    return (name && this.views.get(name)) || this.views.values().next().value
  }

  /** The framework of an already-resolved view (or `custom` when there's no view). */
  frameworkOfView(view: ModuleView | undefined): I18nFrameworkId {
    return view?.module.framework ?? 'custom'
  }

  /** The framework of a module by name (or the primary). */
  moduleFramework(moduleName?: string): I18nFrameworkId {
    return this.frameworkOfView(moduleName ? this.view(moduleName) : this.primaryView())
  }

  /** The framework whose shared `ideInsert` builds this module's insert text — its own if it has
   *  one, else `custom` (the always-available fallback for frameworks without editor integration). */
  ideInsertFramework(moduleName?: string): I18nFrameworkId {
    const framework = this.moduleFramework(moduleName)
    return getFramework(framework)?.ideInsert ? framework : 'custom'
  }

  /** The module that owns a source file by its `usages.include` globs, or undefined if none does —
   *  no primary fallback. Inserting/detecting a t-function in an unclaimed file is an error, not a
   *  silent default onto the first module. */
  resolveSourceView(sourceUri: vscode.Uri): ModuleView | undefined {
    const [name] = this.sourceModuleNames(sourceUri)
    return name ? this.views.get(name) : undefined
  }

  /** The module that owns a resource file (by its translations glob). */
  resourceModuleName(uri: vscode.Uri): string | undefined {
    const hit = this.fileToModule.get(uri.toString())
    if (hit) {
      return hit
    }
    for (const view of this.views.values()) {
      if (this.matchesModuleGlob(uri, view.module)) {
        return view.name
      }
    }
    return undefined
  }

  /**
   * The framework scan contexts for a source file: one `ModuleView` per distinct framework whose
   * module owns the file (a repo mixing frameworks detects each syntax). Falls back to the primary
   * module when no module claims the file.
   */
  sourceScanContexts(uri: vscode.Uri): { framework: string; view: ModuleView }[] {
    const seen = new Set<string>()
    const contexts: { framework: string; view: ModuleView }[] = []
    for (const name of this.sourceModuleNames(uri)) {
      const view = this.views.get(name)
      if (!view || seen.has(view.module.framework)) {
        continue
      }
      seen.add(view.module.framework)
      contexts.push({ framework: view.module.framework, view })
    }
    return contexts
  }

  /** Modules whose `usages.include` matches a source file (a file may belong to several). */
  sourceModuleNames(uri: vscode.Uri): string[] {
    const rel = vscode.workspace.asRelativePath(uri, false)
    return this.allViews()
      .filter((v) => {
        if (v.module.usages.exclude?.some((ex) => minimatch(rel, ex, { dot: true }))) {
          return false
        }
        return v.module.usages.include.some((g) => minimatch(rel, g, { dot: true }))
      })
      .map((v) => v.name)
  }

  /**
   * Best `ModuleView` for an operation given whatever context is available:
   * explicit module > resource-file uri > source-file uri (narrowed by keypath/ns) > primary.
   */
  resolveView(opts: {
    moduleName?: string
    translationFileUri?: vscode.Uri
    sourceUri?: vscode.Uri
    keypath?: string
    namespace?: Namespace
  }): ModuleView | undefined {
    if (opts.moduleName && this.views.has(opts.moduleName)) {
      return this.views.get(opts.moduleName)
    }
    if (opts.translationFileUri) {
      const name = this.resourceModuleName(opts.translationFileUri)
      if (name) {
        return this.views.get(name)
      }
    }
    if (opts.sourceUri) {
      const names = this.sourceModuleNames(opts.sourceUri)
      if (names.length === 1) {
        return this.views.get(names[0]!)
      }
      if (names.length > 1) {
        if (opts.keypath) {
          for (const name of names) {
            const view = this.views.get(name)!
            if (view.getFlatTranslationsPerKeypath(opts.namespace)[opts.keypath]) {
              return view
            }
          }
        }
        const primary = this.primaryModuleName
        if (primary && names.includes(primary)) {
          return this.views.get(primary)
        }
        return this.views.get(names[0]!)
      }
    }
    return this.primaryView()
  }

  private viewForWrite(moduleName?: string): ModuleView | undefined {
    return (moduleName && this.views.get(moduleName)) || this.primaryView()
  }

  /**
   * Resolve the module for a hover command (edit/rename/actions): the active editor is the hovered
   * file — a resource file resolves by its glob, a source file by `usages.include`, narrowed by the
   * keypath. Hover commands carry no uri in their args, so this reads `activeTextEditor`.
   */
  resolveViewForActiveEditor(keypath?: string, namespace?: Namespace): ModuleView | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri
    return this.resolveView({ translationFileUri: uri, sourceUri: uri, keypath, namespace })
  }

  // --- file lifecycle ---

  async handleFileCreate(uri: vscode.Uri): Promise<void> {
    try {
      await fileResolver.addResourceFile(uri)
      const module = this.runtimeModules().find((m) => this.matchesModuleGlob(uri, m))
      if (module) {
        await this.rebuildModules([module.name])
      }
    } catch (e) {
      handleError({ internal: `Failed to handle file creation for ${vscode.workspace.asRelativePath(uri)}`, e })
    }
  }

  async handleFileUpdate(fileUris: vscode.Uri[]) {
    const affected = new Set<string>()
    for (const uri of fileUris) {
      const module = this.runtimeModules().find((m) => this.matchesModuleGlob(uri, m))
      if (module) {
        affected.add(module.name)
      }
    }
    await this.rebuildModules(affected)
    updateAnnotations()
  }

  async handleFileDelete(fileUris: vscode.Uri[]) {
    const affected = new Set<string>()
    for (const uri of fileUris) {
      const name = this.fileToModule.get(uri.toString())
      if (name) {
        affected.add(name)
      }
      await fileResolver.removeResourceFile(uri)
    }
    await this.rebuildModules(affected)
    updateAnnotations()
  }

  async readData(uris?: vscode.Uri[]) {
    if (uris) {
      await this.handleFileUpdate(uris)
    } else {
      await this.rebuildAll()
    }
  }

  // --- cross-module aggregates (genuinely global: pickers, word count, glossary) ---

  get allLocales(): Locale[] {
    const locales = new Set<Locale>()
    for (const view of this.views.values()) {
      for (const locale of view.allLocales) {
        locales.add(locale)
      }
    }
    return this.sortLocales([...locales])
  }

  get namespaces(): Namespace[] {
    const set = new Set<Namespace>()
    for (const view of this.views.values()) {
      for (const ns of view.namespaces) {
        set.add(ns)
      }
    }
    // Sort the primary module's default namespace first (the most common one to reach for).
    const primaryDefaultNs = this.primaryView()?.defaultNs
    return [...set].sort((a, b) => (a === primaryDefaultNs ? -1 : b === primaryDefaultNs ? 1 : 0))
  }

  private sortLocales(localesArray: Locale[]): Locale[] {
    const userConfiguredDisplayLocale = cfg.settings.annotations.previewLocale
    const userEnvironmentLocale = vscode.env.language

    return localesArray.sort((a, b) => {
      if (a === userConfiguredDisplayLocale) {
        return -1
      }
      if (b === userConfiguredDisplayLocale) {
        return 1
      }
      if (a === userEnvironmentLocale) {
        return -1
      }
      if (b === userEnvironmentLocale) {
        return 1
      }
      if (a.startsWith(b)) {
        return 1
      }
      if (b.startsWith(a)) {
        return -1
      }

      const aIndex = cfg.allSupportedLanguages.findIndex((lang) => a.startsWith(lang.code))
      const bIndex = cfg.allSupportedLanguages.findIndex((lang) => b.startsWith(lang.code))
      if (aIndex === bIndex) {
        return 0
      }
      if (aIndex === -1) {
        return 1
      }
      if (bIndex === -1) {
        return -1
      }
      return aIndex - bIndex
    })
  }

  get displayLocale(): string {
    const userConfiguredDisplayLocale = cfg.settings.annotations.previewLocale
    if (userConfiguredDisplayLocale && this.allLocales.includes(userConfiguredDisplayLocale)) {
      return userConfiguredDisplayLocale
    }
    const userEnvironmentLocale = vscode.env.language
    if (userEnvironmentLocale && this.allLocales.includes(userEnvironmentLocale)) {
      return userEnvironmentLocale
    }
    return this.allLocales[0] ?? 'en'
  }

  get secondDisplayLocale(): string {
    const primaryDisplayLocale = this.displayLocale
    if (this.allLocales.length <= 1) {
      return primaryDisplayLocale
    }
    const userEnvironmentLocale = vscode.env.language
    if (
      userEnvironmentLocale &&
      userEnvironmentLocale !== primaryDisplayLocale &&
      this.allLocales.includes(userEnvironmentLocale)
    ) {
      return userEnvironmentLocale
    }
    return this.allLocales.filter((l) => l !== primaryDisplayLocale)[0] ?? 'en'
  }

  /** { "ns:my.key": {en,de} } merged across ALL modules — for project word count / glossary search. */
  get mergedFlatTranslationsPerKeypath(): Record<string, LocalizedText> {
    const result: Record<string, LocalizedText> = {}
    for (const view of this.views.values()) {
      for (const [key, value] of Object.entries(view.mergedFlatTranslationsPerKeypath)) {
        result[key] = { ...(result[key] ?? {}), ...value }
      }
    }
    return result
  }

  // --- reads: route to a module when named, else aggregate across modules ---

  getResourceFileNs(uri: vscode.Uri): Namespace | null {
    const name = this.resourceModuleName(uri)
    const view = name ? this.views.get(name) : undefined
    return view ? view.manager.getResourceFileNs(vscode.workspace.asRelativePath(uri, false)) : null
  }

  getTranslationsPerLocale(namespace?: Namespace, moduleName?: string): Localized<object> {
    if (moduleName) {
      return this.views.get(moduleName)?.getTranslationsPerLocale(namespace) ?? {}
    }
    return this.primaryView()?.getTranslationsPerLocale(namespace) ?? {}
  }

  /**
   * Whether a module stores keypaths nested (json/yaml hierarchies) vs flat (the whole string is one
   * literal key, as with `.properties` or laravel). Per-module — a flat backend module is not
   * forced into the primary module's nesting. Drives keypath suggestion + input validation.
   */
  keypathStructure(namespace?: Namespace, moduleName?: string): 'nested' | 'flat' {
    const perLocale = this.getTranslationsPerLocale(namespace, moduleName)
    const nests = Object.values(perLocale).some(
      (tree) => !!tree && Object.values(tree).some((v) => v !== null && typeof v === 'object'),
    )
    return nests ? 'nested' : 'flat'
  }

  getFlatTranslationsPerLocale(namespace?: Namespace, moduleName?: string): Localized<Record<string, string>> {
    if (moduleName) {
      return this.views.get(moduleName)?.getFlatTranslationsPerLocale(namespace) ?? {}
    }
    const out: Localized<Record<string, string>> = {}
    for (const view of this.views.values()) {
      for (const [locale, perKeypath] of Object.entries(view.getFlatTranslationsPerLocale(namespace))) {
        out[locale] = { ...(out[locale] ?? {}), ...perKeypath }
      }
    }
    return out
  }

  getFlatTranslationsPerKeypath(namespace?: Namespace, moduleName?: string): Record<string, LocalizedText> {
    if (moduleName) {
      return this.views.get(moduleName)?.getFlatTranslationsPerKeypath(namespace) ?? {}
    }
    const out: Record<string, LocalizedText> = {}
    for (const view of this.views.values()) {
      for (const [keypath, localized] of Object.entries(view.getFlatTranslationsPerKeypath(namespace))) {
        out[keypath] = { ...(out[keypath] ?? {}), ...localized }
      }
    }
    return out
  }

  getTranslationsPerKeypath(namespace?: Namespace, moduleName?: string): object {
    const view = (moduleName && this.views.get(moduleName)) || this.primaryView()
    return view?.getTranslationsPerKeypath(namespace) ?? {}
  }

  allLocalesLocalizedText(keypath: string, namespace?: Namespace, moduleName?: string): LocalizedText {
    const view = moduleName ? this.views.get(moduleName) : undefined
    if (view) {
      return view.allLocalesLocalizedText(keypath, namespace)
    }
    const existing = this.getFlatTranslationsPerKeypath(namespace)[keypath] ?? {}
    return Object.fromEntries(this.allLocales.map((l) => [l, existing[l] ?? '']))
  }

  existingTranslationsLocalizedText(keypath: string, namespace?: Namespace, moduleName?: string): LocalizedText {
    const view = moduleName ? this.views.get(moduleName) : undefined
    if (view) {
      return view.existingTranslationsLocalizedText(keypath, namespace)
    }
    const existing = this.getFlatTranslationsPerKeypath(namespace)[keypath] ?? {}
    return Object.fromEntries(this.allLocales.map((l) => [l, existing[l]]).filter(([, v]) => !!v))
  }

  getKeypathSuggestions(
    input: string,
    displayLocale: Locale,
    namespace?: Namespace,
    moduleName?: string,
  ): KeypathSuggestion[] {
    const view = (moduleName && this.views.get(moduleName)) || this.primaryView()
    return view?.getKeypathSuggestions(input, displayLocale, namespace) ?? []
  }

  // --- writes: route to the owning module's manager ---

  private relToUri(relativePath: string): vscode.Uri {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri
    return root ? vscode.Uri.joinPath(root, relativePath) : vscode.Uri.file(relativePath)
  }

  /** Rewrite linked-message references (`@:old` → `@:new`) inside a serialized resource file. */
  private rewriteLinkedRefs(
    content: string,
    oldKeypath: string,
    newKeypath: string,
    framework: string,
    targetNs?: string,
  ): string {
    const utils = getFramework(framework)?.ideInsert?.linkedMessageUtils
    if (!utils) {
      return content
    }
    const search = utils.build(oldKeypath, targetNs)
    if (!content.includes(search)) {
      return content
    }
    const regex = new RegExp(utils.regex.source, utils.regex.flags)
    return content.replace(regex, (match, ref) => {
      const { keypath: refKeypath, ns: refNs } = utils.parse(ref)
      if (refKeypath === oldKeypath && refNs === targetNs) {
        return match.replace(oldKeypath, newKeypath)
      }
      return match
    })
  }

  /** Stage a full-file write (replace when the file exists, else create) into a workspace edit. */
  private async stageFileWrite(
    workspaceEdit: vscode.WorkspaceEdit,
    relativePath: string,
    content: string,
  ): Promise<vscode.Uri> {
    const uri = this.relToUri(relativePath)
    const existing = await vscode.workspace.openTextDocument(uri).then(
      (d) => d,
      () => undefined,
    )
    if (existing) {
      const fullRange = new vscode.Range(existing.positionAt(0), existing.positionAt(existing.getText().length))
      workspaceEdit.replace(uri, fullRange, content)
    } else {
      workspaceEdit.createFile(uri, { ignoreIfExists: true })
      workspaceEdit.insert(uri, new vscode.Position(0, 0), content)
    }
    return uri
  }

  private async applyContentMap(changes: Map<string, string>): Promise<vscode.Uri[]> {
    const affected: vscode.Uri[] = []
    const ok = await editWorkspaceAndSave(
      async (workspaceEdit) => {
        for (const [relativePath, content] of changes) {
          affected.push(await this.stageFileWrite(workspaceEdit, relativePath, content))
        }
      },
      async (uris) => {
        await this.handleFileUpdate(uris)
      },
    )
    return ok ? affected : []
  }

  async updateValues(
    update: LocalizedText,
    keypath: string,
    namespace?: Namespace,
    moduleName?: string,
  ): Promise<boolean> {
    const view = this.viewForWrite(moduleName)
    if (!view) {
      return false
    }
    const changes = view.manager.updateValue(keypath, update, namespace ?? view.defaultNs)
    if (!changes.size) {
      return false
    }
    const affected = await this.applyContentMap(changes)
    return affected.length > 0
  }

  /**
   * Stage a new message across locales. `entries` maps each keypath to its per-locale values — one
   * keypath for a plain message or value-locus plural, several sibling keys for a key-locus plural.
   */
  async collectWorkspaceChangesForNewMessage(
    workspaceEdit: vscode.WorkspaceEdit,
    entries: Record<string, LocalizedText>,
    namespace?: Namespace,
    moduleName?: string,
  ) {
    const view = this.viewForWrite(moduleName)
    const affectedUris: vscode.Uri[] = []
    if (!view) {
      return { affectedUris }
    }
    const changes = view.manager.updateKeypaths(entries, namespace ?? view.defaultNs)
    for (const [relativePath, content] of changes) {
      affectedUris.push(await this.stageFileWrite(workspaceEdit, relativePath, content))
    }
    return { affectedUris }
  }

  /** Update the in-memory model immediately (disk write follows via `collectUpdateKeyChanges`). */
  async renameKeypathInternally(oldKeypath: string, newKeypath: string, namespace?: string, moduleName?: string) {
    const view = this.viewForWrite(moduleName)
    if (!view) {
      return
    }
    const ns = namespace ?? view.defaultNs
    view.manager.renameKeypath(oldKeypath, newKeypath, ns)
    this.rewriteLinkedRefsInPlace(view, oldKeypath, newKeypath, ns)
  }

  /** Rewrite linked-message refs across a module's files in the live manager (after a key rename). */
  private rewriteLinkedRefsInPlace(view: ModuleView, oldKeypath: string, newKeypath: string, ns: Namespace) {
    if (!getFramework(view.module.framework)?.ideInsert?.linkedMessageUtils) {
      return
    }
    const contents = view.manager.getAllFileContents()
    const localeMap = view.manager.getFileLocaleMap()
    let changed = false
    const rewritten = [...contents].map(([relativePath, content]) => {
      const fileNs = localeMap.get(relativePath)?.namespace
      const targetNs = fileNs === ns ? undefined : ns
      const next = this.rewriteLinkedRefs(content, oldKeypath, newKeypath, view.module.framework, targetNs)
      if (next !== content) {
        changed = true
      }
      return { relativePath, content: next }
    })
    if (changed) {
      view.manager.reloadFiles(rewritten)
    }
  }

  /** Build atomic rename edits (key rename + linked-ref rewrite) for the owning module's files. */
  async collectUpdateKeyChanges(
    workspaceEdit: vscode.WorkspaceEdit,
    oldKeypath: string,
    newKeypath: string,
    namespace?: string,
    moduleName?: string,
  ) {
    const view = this.viewForWrite(moduleName)
    if (!view) {
      return
    }
    const ns = namespace ?? view.defaultNs

    // non-mutating: rename via throwaway manager off LIVE content (not disk) — honors unsaved state
    const currentContents = view.manager.getAllFileContents()
    const localeMap = view.manager.getFileLocaleMap()
    const temp = new ResourceManager(
      this.managerConfig(view.module, view.defaultNs),
      [...currentContents].map(([relativePath, content]) => ({ relativePath, content })),
    )
    temp.renameKeypath(oldKeypath, newKeypath, ns)
    const post = temp.getAllFileContents()

    for (const [relativePath, original] of currentContents) {
      let content = post.get(relativePath) ?? original
      const fileNs = localeMap.get(relativePath)?.namespace
      const targetNs = fileNs === ns ? undefined : ns
      content = this.rewriteLinkedRefs(content, oldKeypath, newKeypath, view.module.framework, targetNs)
      if (content !== original) {
        const uri = this.relToUri(relativePath)
        const document = await vscode.workspace.openTextDocument(uri)
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length))
        workspaceEdit.replace(uri, fullRange, content)
      }
    }
  }
}

export const resourceService = new ResourceService()
