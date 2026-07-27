import { describe, expect, it } from 'vitest'
import { parseDefaultNsFromSetup } from './detection'

describe('parseDefaultNsFromSetup', () => {
  it('parses the canonical example from docs', () => {
    const content = `
      import i18next from 'i18next';

      i18next
        .use(i18nextHttpBackend)
        .use(i18nextBrowserLanguageDetector)
        .init({
          fallbackLng: 'en',
          debug: true,
          ns: ['special', 'common'],
          defaultNS: 'special',
          backend: {
            loadPath: 'https://raw.githubusercontent.com/i18next/i18next-gitbook/master/locales/{{lng}}/{{ns}}.json',
            crossDomain: true
          }
        }, function(err, t) {
          updateContent();
        });`
    expect(parseDefaultNsFromSetup(content)).toBe('special')
  })

  it('parses defaultNS from i18next.init with a string value', () => {
    const content = `
      import i18next from 'i18next';

      i18next.init({
        debug: true,
        defaultNS: 'common',
        fallbackLng: 'en',
      });
    `
    expect(parseDefaultNsFromSetup(content)).toBe('common')
  })

  it('parses defaultNS from i18next.init with an array value', () => {
    const content = `
      import i18next from 'i18next';

      i18next.init({
        defaultNS: ['home'],
        lng: 'en',
      });
    `
    expect(parseDefaultNsFromSetup(content)).toBe('home')
  })

  it('parses defaultNS from a setDefaultNamespace call', () => {
    const content = `
      import i18next from 'i18next';

      i18next.setDefaultNamespace('profile');
    `
    expect(parseDefaultNsFromSetup(content)).toBe('profile')
  })

  it('handles various whitespace and newlines', () => {
    const content = `
      import i18next from 'i18next'
      import { initReactI18next } from 'react-i18next'

      i18next
        .use(initReactI18next)
        .init({
          lng: 'en',
          fallbackLng: 'en',

          defaultNS: 'app',

          interpolation: {
            escapeValue: false,
          },
        });
    `
    expect(parseDefaultNsFromSetup(content)).toBe('app')
  })

  it('returns undefined when defaultNS is not present', () => {
    const content = `
      import i18next from 'i18next';

      i18next.init({
        lng: 'en',
      });
    `
    expect(parseDefaultNsFromSetup(content)).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(parseDefaultNsFromSetup('')).toBeUndefined()
  })
})
