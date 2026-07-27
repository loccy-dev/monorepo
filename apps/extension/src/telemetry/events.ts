export enum TelemetryEvent {
  install = 'install',
  launch = 'launch',
  createConfigFile = 'createConfigFile',
  migrateJsonConfig_suggested = 'migrateJsonConfig_suggested',
  migrateJsonConfig_done = 'migrateJsonConfig_done', // {migratedAiInstructions: 'true'|'false'}
  migrateJsonConfig_failed = 'migrateJsonConfig_failed', // {error: <string>}

  detectResources = 'detectResources', // {locales: "en,ru,fr"}

  // to understand the timing of errors
  initGitignore = 'initGitignore',
  initConfig = 'initConfig',
  initFileResolver = 'initFileResolver',
  initResourceService = 'initResourceService',
  initUsageService = 'initUsageService',

  paidFeatureUsed = 'paidFeatureUsed',

  translate = 'translate', // extractAndTranslateCmd

  actionsWithTranslations = 'actionsWithTranslations',

  actionsWithTranslations_editViaPrompt = 'actionsWithTranslations_editViaPrompt',
  actionsWithTranslations_editViaPrompt_done = 'actionsWithTranslations_editViaPrompt_done', // {prompt: <string>}
  actionsWithTranslations_editAsJson = 'actionsWithTranslations_editAsJson',
  actionsWithTranslations_editAsJson_done = 'actionsWithTranslations_editAsJson_done',
  actionsWithTranslations_editAsJson_unchanged = 'actionsWithTranslations_editAsJson_unchanged',

  // keypath editing
  actionsWithTranslations_editKeypath = 'actionsWithTranslations_editKeypath',
  actionsWithTranslations_editKeypath_done = 'actionsWithTranslations_editKeypath_done',

  editTranslation = 'editTranslation',
  editTranslation_save = 'editTranslation_save',
  editTranslation_saveAndUpdateOthers = 'editTranslation_saveAndUpdateOthers',
  editTranslation_saveAndUpdateOthers_done = 'editTranslation_saveAndUpdateOthers_done',
  editTranslation_saveAndTranslateOthers = 'editTranslation_saveAndTranslateOthers',
  editTranslation_saveAndTranslateOthers_done = 'editTranslation_saveAndTranslateOthers_done',
  editTranslation_polishDraft = 'editTranslation_polishDraft', // {text: <string>}
  editTranslation_viaPrompt = 'editTranslation_viaPrompt', // {prompt: <string>, text: <string>}
  editTranslation_viaPrompt_done = 'editTranslation_viaPrompt_done',

  searchTranslations = 'searchTranslations',
  searchTranslations_done = 'searchTranslations_done',

  signInWindow_show = 'signInWindow_show',
  signInWindow_clickSignIn = 'signInWindow_clickSignIn',
  signInWindow_clickSignIn_done = 'signInWindow_clickSignIn_done',
  signInWindow_clickSignIn_error = 'signInWindow_clickSignIn_error', // {error: <string>}
  signInWindow_clickCancel = 'signInWindow_clickCancel',
}
