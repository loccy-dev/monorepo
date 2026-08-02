import { describe, expect, it } from 'vitest'
import { requireCount, requireKeypath, requireLocale, resolveNamespace } from './context'
import { captureFailure, fakeContext } from './test-fixtures'

const single = fakeContext({ _: { 'login.title': { en: 'Sign in' } } }, ['en', 'de'])
const multi = fakeContext(
  {
    auth: { 'login.title': { en: 'Sign in' } },
    admin: { 'login.title': { en: 'Admin sign in' }, 'users.title': { en: 'Users' } },
  },
  ['en', 'de'],
)

describe('resolveNamespace', () => {
  it('takes the sole namespace unasked, since there is nothing to choose', () => {
    const only = fakeContext({ auth: { 'login.title': { en: 'Sign in' } } }, ['en'])
    expect(resolveNamespace(only)).toBe('auth')
  })

  it('takes the one --ns names', () => {
    expect(resolveNamespace(multi, { ns: 'admin' })).toBe('admin')
  })

  it('refuses to guess between namespaces, so a new key never lands in one nobody named', () => {
    const { stderr } = captureFailure(() => resolveNamespace(multi))
    expect(stderr).toContain('This project has 2 namespaces: auth, admin')
    expect(stderr).toContain('--ns auth')
  })

  it('refuses an unknown namespace', () => {
    const { stderr } = captureFailure(() => resolveNamespace(multi, { ns: 'nope' }))
    expect(stderr).toContain('Namespace "nope" not found. Available: auth, admin')
  })

  it('refuses --ns where the project has no namespaces at all', () => {
    const { stderr } = captureFailure(() => resolveNamespace(single, { ns: 'auth' }))
    expect(stderr).toContain('This project has no namespaces')
  })

  it('answers with the sentinel where the project has none, which is where every key lands', () => {
    expect(resolveNamespace(single)).toBe('_')
  })
})

describe('requireKeypath', () => {
  it('takes a plain keypath', () => {
    expect(requireKeypath('login.title')).toBe('login.title')
  })

  it('refuses a namespace spelled into the key, since --ns is the only way to name one', () => {
    const { stderr } = captureFailure(() => requireKeypath('admin:users.title'))
    expect(stderr).toContain('spells a namespace into the key')
  })

  it.each(['login.', '.login', 'login..title', ''])('refuses the malformed key %o', (key) => {
    const { stderr } = captureFailure(() => requireKeypath(key))
    expect(stderr).toMatch(/cannot be empty|has an empty segment/)
  })
})

describe('locales', () => {
  it('refuses a locale the translation files do not hold', () => {
    const { stderr } = captureFailure(() => requireLocale(single, 'zz'))
    expect(stderr).toContain('Locale "zz" not detected. Available: en, de')
  })
})

describe('requireCount', () => {
  it('falls back when the option is absent', () => {
    expect(requireCount(undefined, '--limit', 10)).toBe(10)
  })

  it('takes a whole number', () => {
    expect(requireCount('25', '--limit', 10)).toBe(25)
  })

  it.each(['abc', '0', '-3', '2.5', ''])('refuses %o rather than returning nothing', (raw) => {
    const { stderr } = captureFailure(() => requireCount(raw, '--limit', 10))
    expect(stderr).toContain('--limit must be a whole number of 1 or more')
  })
})
