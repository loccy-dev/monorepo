import { expect, vi } from 'vitest'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import type { ModuleContext } from '../context'

/**
 * A context holding just the translation tree, for the guards and key resolution that read nothing
 * else. `flat` is `{ namespace: { keypath: { locale: value } } }`.
 */
export function fakeContext(
  flat: Record<string, Record<string, Record<string, string>>>,
  locales: string[] = ['en'],
): ModuleContext {
  const namespaces = Object.keys(flat)
  const rm = {
    namespaces,
    defaultNs: namespaces[0] ?? NS_WITHOUT_NS,
    allLocales: locales,
    getFlatTranslationsPerKeypath: (ns?: string) => flat[ns ?? namespaces[0]!] ?? {},
  }
  return { rm, config: {}, module: {}, platform: {} } as unknown as ModuleContext
}

/**
 * Run `act` and assert it exited with 1, returning what it wrote to stderr and stdout. The commands
 * report a refusal by printing and exiting, so that pair is what a guard test has to see.
 */
export function captureFailure(act: () => void): { stderr: string; stdout: string } {
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('__exit__')
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})

  try {
    expect(act).toThrow('__exit__')
    expect(exit).toHaveBeenCalledWith(1)
    return {
      stderr: error.mock.calls.map((call) => call.join(' ')).join('\n'),
      stdout: log.mock.calls.map((call) => call.join(' ')).join('\n'),
    }
  } finally {
    exit.mockRestore()
    error.mockRestore()
    log.mockRestore()
  }
}
