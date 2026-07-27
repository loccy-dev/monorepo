import { Logger } from '../logger'

export const DEBUG: null | number = null

let isDebugging = false
export const startDebugging = () => (isDebugging = true)
export const stopDebugging = () => (isDebugging = false)

export function debug(...params: any) {
  if (!isDebugging) {
    return
  }
  const prefix = `dynamicKeyResolver`
  Logger.debug(prefix, ...params)
}

export function dedupe(values: string[]): string[] {
  return Array.from(new Set(values))
}
