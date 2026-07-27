import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import translationEn from '../../public/locales/en/translation.json'
import dashboardEn from '../../public/locales/en/dashboard.json'
import translationDe from '../../public/locales/de/translation.json'
import dashboardDe from '../../public/locales/de/dashboard.json'
import translationRu from '../../public/locales/ru/translation.json'
import dashboardRu from '../../public/locales/ru/dashboard.json'

// the translations
// (tip move them in a JSON file and import them,
// or even better, manage them separated from your code: https://react.i18next.com/guides/multiple-translation-files)
const resources = {
  en: {
    translation: translationEn,
    dashboard: dashboardEn,
  },
  de: {
    translation: translationDe,
    dashboard: dashboardDe,
  },
  ru: {
    translation: translationRu,
    dashboard: dashboardRu,
  },
}

i18n
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources,
    lng: 'en', // language to use, more information here: https://www.i18next.com/overview/configuration-options#languages-namespaces-resources
    // you can use the i18n.changeLanguage function to change the language manually: https://www.i18next.com/overview/api#changelanguage
    // if you're using a language detector, do not define the lng option

    interpolation: {
      escapeValue: false, // react already safes from xss
    },
  })

export default i18n
