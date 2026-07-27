'use client'

import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

const languages = ['en', 'de', 'ru'] as const

export default function Home() {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function changeLocale(lng: string) {
    document.cookie = `locale=${lng};path=/;max-age=31536000`
    startTransition(() => router.refresh())
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        {languages.map((lng) => (
          <button
            key={lng}
            onClick={() => changeLocale(lng)}
            disabled={isPending}
            style={{ marginRight: 8, fontWeight: locale === lng ? 'bold' : 'normal' }}
          >
            {lng.toUpperCase()}
          </button>
        ))}
      </div>

      <hr />

      <p>{t('welcomeByName', { name: 'John' })}</p>

      <br />
      <p>{t('plural', { count: 0 })}</p>
      <p>{t('plural', { count: 1 })}</p>
      <p>{t('plural', { count: 2 })}</p>
      <p>{t('plural', { count: 5 })}</p>
      <br />

      <p>{t('contextUser', { gender: 'male' })}</p>
      <p>{t('contextUser', { gender: 'female' })}</p>
      <p>{t('contextUser', { gender: 'other' })}</p>
    </div>
  )
}
