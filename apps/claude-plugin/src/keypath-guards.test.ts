import { describe, expect, it } from 'vitest'
import { failOnStructuralCollision } from './keypath-guards'
import { captureFailure, fakeContext } from './test/fake-context'

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
    expect(stderr).toBe(`error: "auth:login" is a group of 2 message(s), not a message
  auth:login.title
  auth:login.cta
  writing here would delete every one of them, so pick a keypath below this one instead`)
  })

  it('refuses to nest a message under an existing message', () => {
    const { stderr } = captureFailure(at('login.title.long'))
    expect(stderr).toBe(`error: "auth:login.title" is already a message, so nothing can nest under it
  rename it out of the way first, or pick a keypath that is not below it`)
  })

  it('does not treat a shared prefix as a collision', () => {
    expect(at('login.titlebar')).not.toThrow()
  })

  it('catches a batch colliding with itself, not just with the files', () => {
    const { stderr } = captureFailure(at('banner', 'banner.text'))
    expect(stderr).toBe(`error: "auth:banner" is a group of 1 message(s), not a message
  auth:banner.text
  writing here would delete every one of them, so pick a keypath below this one instead`)
  })
})
