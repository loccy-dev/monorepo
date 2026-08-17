import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { join } from 'pathe'
import { refuseOnce, UNLOCK_MS } from './retry-window'

/** Where the markers for a scope land, spelled out here so what is left in tmpdir can be counted. */
function scopeDir(scope: string): string {
  return join(tmpdir(), 'loccy-tool-guard', createHash('sha1').update(scope).digest('hex').slice(0, 16))
}

const scopes: string[] = []

/** A scope of this run's own, so a marker another test left behind can never answer for this one. */
function scope(): string {
  const value = `test:${process.pid}:${Math.random()}`
  scopes.push(value)
  return value
}

afterEach(() => {
  vi.useRealTimers()
  for (const value of scopes.splice(0)) rmSync(scopeDir(value), { recursive: true, force: true })
})

/** Move past the window without waiting it out. */
function afterTheWindow(): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(Date.now() + UNLOCK_MS + 1)
}

describe('refuseOnce', () => {
  it('refuses an attempt nothing has been said about, and lets the repeat through', async () => {
    const guard = scope()
    expect(await refuseOnce(guard, 'a batch')).toBe(true)
    expect(await refuseOnce(guard, 'a batch')).toBe(false)
  })

  it('weighs each subject on its own, so one exception does not cover the next thing along', async () => {
    const guard = scope()
    await refuseOnce(guard, 'a batch')
    expect(await refuseOnce(guard, 'another batch')).toBe(true)
  })

  it('refuses afresh once the window has closed, the reasoning that earned the exception being gone', async () => {
    const guard = scope()
    await refuseOnce(guard, 'a batch')

    afterTheWindow()
    expect(await refuseOnce(guard, 'a batch')).toBe(true)
  })

  it('clears the markers whose window has closed rather than leaving them behind in tmpdir', async () => {
    const guard = scope()
    await refuseOnce(guard, 'a batch')
    await refuseOnce(guard, 'another batch')
    expect(readdirSync(scopeDir(guard))).toHaveLength(2)

    afterTheWindow()
    await refuseOnce(guard, 'a third batch')
    expect(readdirSync(scopeDir(guard))).toEqual([expect.any(String)])
  })

  // One per session and one per project, none of which the session after it has any use for.
  it('sweeps up the scope directories left standing once every marker in them has gone', async () => {
    mkdirSync(join(tmpdir(), 'loccy-tool-guard'), { recursive: true })
    const stray = mkdtempSync(join(tmpdir(), 'loccy-tool-guard', 'stray-'))

    await refuseOnce(scope(), 'a batch')

    expect(existsSync(stray)).toBe(false)
  })

  // Failing closed would refuse every attempt for the rest of the session, with no way to get past.
  it('lets the attempt through where the refusal cannot be remembered at all', async () => {
    const guard = scope()
    const dir = scopeDir(guard)
    mkdirSync(dir.slice(0, dir.lastIndexOf('/')), { recursive: true })
    writeFileSync(dir, 'not a directory')

    expect(await refuseOnce(guard, 'a batch')).toBe(false)
  })
})
