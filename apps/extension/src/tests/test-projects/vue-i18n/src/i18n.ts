import de from './locales/de.json'
import en from './locales/en.json'
import ru from './locales/ru.json'
import { createI18n } from 'vue-i18n'

function ruPlural(choice: number, choicesLength: number) {
  if (choice === 0) {
    return 0
  }

  const teen = choice > 10 && choice < 20
  const endsWithOne = choice % 10 === 1
  if (!teen && endsWithOne) {
    return 1
  }
  if (!teen && choice % 10 >= 2 && choice % 10 <= 4) {
    return 2
  }

  return choicesLength < 4 ? 2 : 3
}

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  missingWarn: true,
  fallbackWarn: true,
  pluralRules: {
    ru: ruPlural,
  },
  messages: {
    en,
    de,
    ru,
  },
})

export const customTFunction = i18n.global.t
