'use client'

import { useTranslations } from 'next-intl'

export function DashboardComponent() {
  const t = useTranslations('dashboard')

  const title = t('title')
  const subtitle = t('subtitle', { date: '2024-01-01' })

  return (
    <div></div>
  )
}
