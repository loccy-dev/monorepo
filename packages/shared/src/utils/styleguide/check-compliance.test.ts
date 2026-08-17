import { describe, expect, it } from 'vitest'
import { checkDoNotTranslate, checkGlossary } from './check-compliance'

describe('checkDoNotTranslate', () => {
  const styleguide = { doNotTranslate: [{ term: 'Loccy' }] }

  it('names the locales that dropped a term the others keep', () => {
    expect(checkDoNotTranslate({ en: 'Loccy signs you in', de: 'Wir melden dich an' }, styleguide)).toEqual(['de'])
  })

  it('says nothing where the term is nowhere in play', () => {
    expect(checkDoNotTranslate({ en: 'Sign in', de: 'Anmelden' }, styleguide)).toEqual([])
  })

  it('says nothing where every locale keeps it', () => {
    expect(checkDoNotTranslate({ en: 'Loccy', de: 'Loccy jetzt' }, styleguide)).toEqual([])
  })

  it('reads a term case-insensitively unless the rule says otherwise', () => {
    expect(checkDoNotTranslate({ en: 'Loccy', de: 'loccy' }, styleguide)).toEqual([])
    expect(
      checkDoNotTranslate({ en: 'Loccy', de: 'loccy' }, { doNotTranslate: [{ term: 'Loccy', caseSensitive: true }] }),
    ).toEqual(['de'])
  })

  // An empty value is a delete, and a locale being taken out of a file cannot break a rule.
  it('passes over a locale being emptied', () => {
    expect(checkDoNotTranslate({ en: 'Loccy signs you in', de: '' }, styleguide)).toEqual([])
  })

  it('reads a term as a word, not as any run of letters inside one', () => {
    expect(checkDoNotTranslate({ en: 'Loccy signs you in', de: 'Unloccybar' }, styleguide)).toEqual(['de'])
  })

  // Japanese runs words together, so a term there has a letter on either side of it.
  it('reads a term kept inside unspaced text', () => {
    expect(checkDoNotTranslate({ en: 'Loccy signs you in', ja: 'Loccyがサインインします' }, styleguide)).toEqual([])
  })
})

describe('checkGlossary', () => {
  const styleguide = {
    glossary: [{ definition: 'A table booking', terms: { en: 'Reservation', de: 'Reservierung' } }],
  }

  it('names a locale that leaves out the term another renders by its approved form', () => {
    expect(checkGlossary({ en: 'Reservation confirmed', de: 'Tisch bestätigt' }, styleguide)).toEqual(['de'])
  })

  it('says nothing where the entry is not in play for this message at all', () => {
    expect(checkGlossary({ en: 'Sign in', de: 'Anmelden' }, styleguide)).toEqual([])
  })

  it('names a locale spelling the term by a form the entry deprecates', () => {
    const deprecating = {
      glossary: [
        {
          definition: 'A table booking',
          terms: { en: { preferred: 'Reservation', deprecated: ['Booking'] }, de: 'Reservierung' },
        },
      ],
    }
    expect(checkGlossary({ en: 'Booking confirmed', de: 'Reservierung bestätigt' }, deprecating)).toEqual(['en'])
  })

  it('says nothing about a locale the entry gives no term for', () => {
    const enOnly = { glossary: [{ definition: 'A table booking', terms: { en: 'Reservation' } }] }
    expect(checkGlossary({ en: 'Reservation confirmed', de: 'Tisch bestätigt' }, enOnly)).toEqual([])
  })

  it('falls back to the base language, so a regional locale is held to the same term', () => {
    expect(checkGlossary({ de: 'Reservierung bestätigt', 'de-AT': 'Tisch bestätigt' }, styleguide)).toEqual(['de-AT'])
  })

  const acronym = {
    glossary: [
      {
        definition: 'Artificial intelligence',
        terms: {
          en: 'AI',
          fr: { preferred: 'IA', deprecated: ['AI'] },
          ru: { preferred: 'ИИ', deprecated: ['AI'] },
        },
      },
    ],
  }

  it('reads a term as a word, so an acronym buried in another language is not it', () => {
    expect(checkGlossary({ en: 'AI summary', fr: "Résumé par IA de l'espace de travail" }, acronym)).toEqual([])
  })

  it('reads a word start outside the Latin script too', () => {
    expect(checkGlossary({ en: 'AI summary', ru: 'Сводка от ИИ' }, acronym)).toEqual([])
    expect(checkGlossary({ en: 'AI summary', ru: 'Сводка на линии' }, acronym)).toEqual(['ru'])
  })

  it('still reads a term that a locale inflected or pluralised', () => {
    expect(checkGlossary({ en: 'Reservations confirmed', de: 'Reservierungen bestätigt' }, styleguide)).toEqual([])
  })

  it('reads a term in a script that does not space its words', () => {
    const unspaced = {
      glossary: [{ definition: 'A table booking', terms: { en: 'Reservation', zh: '预订', th: 'การจอง' } }],
    }
    expect(checkGlossary({ en: 'Reservation confirmed', zh: '预订已确认' }, unspaced)).toEqual([])
    expect(checkGlossary({ en: 'Reservation confirmed', th: 'ยกเลิกการจอง' }, unspaced)).toEqual([])
  })
})
