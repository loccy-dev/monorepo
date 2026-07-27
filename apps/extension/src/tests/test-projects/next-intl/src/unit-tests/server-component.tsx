import { getTranslations } from 'next-intl/server'

export async function ServerComponent() {
  const t = await getTranslations()

  const title = t('server.title')

  return (
    <div></div>
  )
}

export async function ServerWithPrefix() {
  const td = await getTranslations('dashboard')

  return <p>{td('subtitle', { date: 'today' })}</p>
}
