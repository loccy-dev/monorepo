import { describe, it, expect } from 'vitest'
import type { FrameworkScanContext } from '../../contracts'
import { springFramework } from './index'
import { icuMessageFormat } from '../../message-formats/icu'
import { detectFrameworkFromDeps, getFramework, getResourceFormatByExt, resolveMessageFormatId } from '../../registry'
import { frameworkDefaultLayout } from '../../loccy-config/layout-defaults'
import { resolveConfig } from '../../loccy-config/loccy-config'
import type { ActiveFrameworkId } from '@repo/types/framework.types'

const ctx = (overrides: Partial<FrameworkScanContext> = {}): FrameworkScanContext => ({
  defaultNs: 'messages',
  customFunctionNames: [],
  dynamicKeyResolver: null,
  messageFormat: icuMessageFormat,
  allLocales: ['en'],
  existingKeypaths: [],
  ...overrides,
})

const keypathsOf = async (content: string, c = ctx()) =>
  (await springFramework.scanContent(content, c)).flatMap((info) => info.keypaths)

describe('spring — getMessage detection (receiver-aware matcher)', () => {
  it('detects a bare `getMessage("key")` call', async () => {
    const [info] = await springFramework.scanContent('getMessage("user.notFound")', ctx())
    expect(info?.type).toBe('static')
    expect(info?.keypaths).toEqual(['user.notFound'])
  })

  it('detects a receiver-qualified `messageSource.getMessage("key")` call', async () => {
    const [info] = await springFramework.scanContent(
      'String s = messageSource.getMessage("welcome", null, locale);',
      ctx(),
    )
    expect(info?.type).toBe('static')
    expect(info?.keypaths).toEqual(['welcome'])
  })

  it('detects a multi-segment receiver chain (`this.msgSource.getMessage("key")`)', async () => {
    expect(await keypathsOf('return this.msgSource.getMessage("k");')).toEqual(['k'])
  })

  it('finds getMessage calls embedded in Java source', async () => {
    const content = 'String a = getMessage("greeting.hello");\nString b = obj.getMessage("greeting.bye");\n'
    expect(await keypathsOf(content)).toEqual(['greeting.hello', 'greeting.bye'])
  })

  it('ignores a key-less call (`foo.getMessage()` — no quoted first arg)', async () => {
    expect(await springFramework.scanContent('String s = ex.getMessage();', ctx())).toHaveLength(0)
    expect(await springFramework.scanContent('String s = getMessage(code);', ctx())).toHaveLength(0)
  })

  it('does not false-match a longer identifier (`getMessageFormat("x")`)', async () => {
    expect(await springFramework.scanContent('getMessageFormat("x")', ctx())).toHaveLength(0)
  })

  it('honors project-configured custom function names, receiver-qualified too', async () => {
    const keys = await keypathsOf('String s = this.i18n.tr("label.save");', ctx({ customFunctionNames: ['tr'] }))
    expect(keys).toEqual(['label.save'])
  })
})

describe('spring — explicit-only, never auto-detected', () => {
  it('is registered under its id', () => {
    expect(getFramework('spring')).toBe(springFramework)
  })

  it('detectFromDeps is always false (deps live in pom.xml/build.gradle)', () => {
    expect(springFramework.detectFromDeps(new Set(['org.springframework:spring-context']))).toBe(false)
    expect(springFramework.detectFromDeps(new Set())).toBe(false)
  })

  it('is never chosen by dependency auto-detection', () => {
    expect(detectFrameworkFromDeps(new Set(['spring', 'spring-boot-starter']))).not.toBe('spring')
  })
})

describe('spring — .properties storage pairs with the icu message format', () => {
  it('resolves to icu (its only hosted format)', () => {
    expect(resolveMessageFormatId(springFramework, new Set())).toBe('icu')
  })

  it('.properties is a supported resource format carrying icu transparently (no welded format)', () => {
    const properties = getResourceFormatByExt('properties')
    expect(properties?.id).toBe('properties')
    expect(properties?.messageFormat).toBeUndefined()
    expect(resolveMessageFormatId(springFramework, new Set(), properties)).toBe('icu')
  })
})

describe('spring — default layout is `messages_{locale}.properties`', () => {
  it('frameworkDefaultLayout returns the framework defaultLayout', () => {
    expect(frameworkDefaultLayout('spring', 'properties')).toBe('messages_{locale}.properties')
  })

  // Parked: backend frameworks (spring) are temporarily disabled at the config surface — see `plans/`.
  it.skip('a spring module with no explicit layout resolves to it end-to-end', () => {
    const config = resolveConfig(
      {
        modules: {
          app: {
            framework: 'spring' as ActiveFrameworkId,
            translations: { glob: 'src/main/resources/**/*.properties' },
          },
        },
      },
      null,
    )
    expect(config.modules.app!.translations.layout).toBe('messages_{locale}.properties')
  })

  it('leaves other frameworks with a derived layout unchanged (no defaultLayout)', () => {
    expect(frameworkDefaultLayout('vue-i18n', 'json')).toBe('{locale}.json')
    expect(frameworkDefaultLayout('react-i18next', 'json')).toBe('{locale}/{namespace}.json')
  })
})

describe('spring — plural insert', () => {
  const insert = springFramework.ideInsert!
  const params = (over = {}) => ({
    tFunctionInfo: { tName: 'getMessage' },
    keypath: 'greeting',
    quoteType: 'double' as const,
    ...over,
  })

  it('non-plural emits a getMessage call', () => {
    expect(insert.insertTFunctionText(params())).toBe('getMessage("greeting")')
  })

  it('plural passes the count as a positional Object[] arg', () => {
    expect(insert.insertTFunctionText(params({ count: { var: '0', expr: 'count' } }))).toBe(
      'getMessage("greeting", new Object[]{ count }, locale)',
    )
  })

  it('uses arg index `0` as the plural var (Java MessageFormat is positional)', () => {
    expect(insert.pluralVar).toBe('0')
  })
})
