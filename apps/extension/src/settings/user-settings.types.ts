// NOTE: keep in sync with:
// - package.json > configuration
// - config -> defaults init

export interface UserSettings {
  sourceLocale: string

  annotations: {
    previewLocale: string
    showMissingTranslationsWarning: boolean
    minMissingLocalesToDisplay: number
  }

  createMessageFromSourceText: {
    suggestKeypath: boolean
    autoTranslate: boolean
  }
}
