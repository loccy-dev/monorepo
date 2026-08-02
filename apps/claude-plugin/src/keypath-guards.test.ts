import { describe, expect, it } from 'vitest'
import { failOnStructuralCollision } from './keypath-guards'
import { captureFailure, fakeContext } from './test-fixtures'

const ctx = fakeContext({
  auth: {
    'login.title': { en: 'Sign in' },
    'login.cta': { en: 'Continue' },
    'signup.title': { en: 'Sign up' },
  },
})

const at =
  (...keypaths: string[]) =>
  () =>
    failOnStructuralCollision(ctx, 'auth', keypaths)

describe('failOnStructuralCollision', () => {
  it('allows a keypath that collides with nothing', () => {
    expect(at('login.subtitle')).not.toThrow()
  })

  it('refuses to write a message over a group of messages', () => {
    const { stderr } = captureFailure(at('login'))
    expect(stderr).toContain('is a group of 2 message(s)')
    expect(stderr).toContain('auth:login.title')
  })

  it('refuses to nest a message under an existing message', () => {
    const { stderr } = captureFailure(at('login.title.long'))
    expect(stderr).toContain('"auth:login.title" is already a message')
  })

  it('does not treat a shared prefix as a collision', () => {
    expect(at('login.titlebar')).not.toThrow()
  })

  it('catches a batch colliding with itself, not just with the files', () => {
    const { stderr } = captureFailure(at('banner', 'banner.text'))
    expect(stderr).toContain('"auth:banner" is a group of 1 message(s)')
  })
})
