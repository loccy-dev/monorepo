import type { Mode } from './mode'

declare function t(key: string): string

export function Toggle({ mode }: { mode: Mode }) {
  return <p>{t(`toggle.${mode}`)}</p>
}
