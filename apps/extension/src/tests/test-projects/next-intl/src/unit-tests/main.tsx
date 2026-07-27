'use client'

import { useTranslations } from 'next-intl'

export function MainComponent() {
  const t = useTranslations()

  // basic t-func calls
  const state = t('state.initial')
  const simple = t('simple.key')
  const double = t("double.quoted")
  const template = t(`template.literal`)

  // with params
  const withParams = t('with.params', { name: 'John' })

  // dynamic keys
  const dynamicKey = 'foo'
  const dynamic1 = t(dynamicKey)
  const dynamic2 = t(`prefix.${dynamicKey}.suffix`)

  return (
    <div title={t('jsx.title')}>
      <p className={t('jsx.attribute')}>{t('jsx.content')}</p>
      <span>{`${t('jsx.template')} text`}</span>
      <button onClick={() => alert(t('jsx.onclick'))}>Click</button>
    </div>
  )
}

// custom t-func name
export function CustomNameComponent() {
  const customTFunc = useTranslations()

  const custom1 = customTFunc('custom.one')
  const custom2 = customTFunc("custom.two")

  return <div>{customTFunc('custom.jsx')}</div>
}
