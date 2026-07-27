import { describe, expect, it } from 'vitest'
import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'
import { detectDefaultNsFromResources } from './detect-default-ns'

describe('detectDefaultNsFromResources', () => {
  it('returns the no-namespace sentinel when there are no files', () => {
    expect(detectDefaultNsFromResources([])).toBe(NS_WITHOUT_NS)
  })

  it('returns the no-namespace sentinel for locale-structured files (no namespace in the filename)', () => {
    expect(detectDefaultNsFromResources(['messages/en.json', 'messages/de.json'])).toBe(NS_WITHOUT_NS)
  })

  it('picks the most common namespace filename', () => {
    const paths = ['locales/en/common.json', 'locales/de/common.json', 'locales/en/auth.json']
    expect(detectDefaultNsFromResources(paths)).toBe('common')
  })

  it('prefers a prioritized namespace even when it is not the most common', () => {
    const paths = ['locales/en/common.json', 'locales/de/common.json', 'locales/en/auth.json']
    expect(detectDefaultNsFromResources(paths, ['auth'])).toBe('auth')
  })
})
