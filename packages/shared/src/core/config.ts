/** Canonical Loccy URLs. Single source of truth so every surface (config header, CLI help,
 * IDE) links the same place and never drifts. */
export const LOCCY_HOME = 'https://loccy.dev'
export const LOCCY_DOCS = `${LOCCY_HOME}/docs`
export const LOCCY_SCHEMA_URL = `${LOCCY_HOME}/schemas/config.schema.json`

// https://ai.google.dev/gemini-api/docs/models#supported-languages
export const allSupportedLanguages = [
  { name: 'English', code: 'en' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Spanish', code: 'es' },
  { name: 'French', code: 'fr' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Bengali', code: 'bn' },
  { name: 'Russian', code: 'ru' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Indonesian', code: 'id' },
  { name: 'Japanese', code: 'ja' },
  { name: 'German', code: 'de' },
  { name: 'Korean', code: 'ko' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Vietnamese', code: 'vi' },
  { name: 'Italian', code: 'it' },
  { name: 'Thai', code: 'th' },
  { name: 'Polish', code: 'pl' },
  { name: 'Ukrainian', code: 'uk' },
  { name: 'Dutch', code: 'nl' },
  { name: 'Romanian', code: 'ro' },
  { name: 'Greek', code: 'el' },
  { name: 'Czech', code: 'cs' },
  { name: 'Hungarian', code: 'hu' },
  { name: 'Hebrew', code: 'he' }, // they have old 'iw' name here
  { name: 'Swedish', code: 'sv' },
  { name: 'Bulgarian', code: 'bg' },
  { name: 'Serbian', code: 'sr' },
  { name: 'Danish', code: 'da' },
  { name: 'Finnish', code: 'fi' },
  { name: 'Norwegian', code: 'no' },
  { name: 'Slovak', code: 'sk' },
  { name: 'Croatian', code: 'hr' },
  { name: 'Lithuanian', code: 'lt' },
  { name: 'Slovenian', code: 'sl' },
  { name: 'Latvian', code: 'lv' },
  { name: 'Estonian', code: 'et' },
  { name: 'Swahili', code: 'sw' },
]

export const SURROUNDING_CODE_AI_CONTEXT_LEN = 300

export const MAX_RESOURCE_FILE_SIZE = 5 * 1024 * 1024 // 5MB
