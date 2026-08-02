import { describe, expect, it } from 'vitest'
import type { KeypathInfo } from '@repo/types/framework.types'
import { usageMatchesNamespace } from './find-usages'

function info(ns: string): KeypathInfo {
  return { loc: { start: 0, end: 0, line: 0 }, content: '', ns, keypaths: ['login.title'], type: 'static' }
}

describe('usageMatchesNamespace', () => {
  it('matches the namespace the usage names', () => {
    expect(usageMatchesNamespace(info('auth'), 'auth', 'translation')).toBe(true)
  })

  it('separates the same keypath under two namespaces', () => {
    expect(usageMatchesNamespace(info('admin'), 'auth', 'translation')).toBe(false)
  })

  it('reads a usage that names none as the default namespace', () => {
    expect(usageMatchesNamespace(info(''), 'translation', 'translation')).toBe(true)
    expect(usageMatchesNamespace(info(''), 'auth', 'translation')).toBe(false)
  })
})
