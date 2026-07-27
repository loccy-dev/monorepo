import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import de from '../../messages/de.json'
import en from '../../messages/en.json'
import ru from '../../messages/ru.json'

const supportedLocales = ['en', 'de', 'ru'] as const
type Locale = (typeof supportedLocales)[number]

const messagesByLocale = { en, de, ru } as const satisfies Record<Locale, typeof en>

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const localeCookie = cookieStore.get('locale')?.value
  const locale: Locale = supportedLocales.includes(localeCookie as Locale)
    ? (localeCookie as Locale)
    : 'en'

  return {
    locale,
    messages: messagesByLocale[locale],
  }
})
