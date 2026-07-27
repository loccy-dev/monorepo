import * as assert from 'assert'
import { ResourceService } from '../helpers/resource-service'

suite('ResourceService', () => {
  let service: ResourceService

  suite('Structure 1: Locale files (non-namespaced)', () => {
    suite('with nested JSON structure', () => {
      setup(() => {
        service = new ResourceService()
        service.setTestModule(
          [
            {
              relativePath: 'src/locale/en.json',
              content: '{"user":{"title":"User Title","description":"User Description"}}',
            },
            {
              relativePath: 'src/locale/ru.json',
              content: '{"user":{"title":"Заголовок пользователя","description":"Описание пользователя"}}',
            },
          ],
          { globPattern: 'src/locale/*.json', layout: '{locale}.json', sortKeys: true },
        )
      })

      test('getFlatTranslationsPerLocale flattens nested structure', () => {
        const result = service.getFlatTranslationsPerLocale()
        assert.deepStrictEqual(result, {
          en: { 'user.title': 'User Title', 'user.description': 'User Description' },
          ru: { 'user.title': 'Заголовок пользователя', 'user.description': 'Описание пользователя' },
        })
      })

      test('getTranslationsPerKeypath aggregates translations', () => {
        const result = service.getTranslationsPerKeypath()
        assert.deepStrictEqual(result, {
          user: {
            title: { en: 'User Title', ru: 'Заголовок пользователя' },
            description: { en: 'User Description', ru: 'Описание пользователя' },
          },
        })
      })

      test('updateValue updates nested structure', () => {
        const changes = service.view('default')!.manager.updateValue('user.title', { en: 'Updated Title' })

        assert.strictEqual(changes.size, 1)
        const parsed = JSON.parse(changes.get('src/locale/en.json')!)
        assert.deepStrictEqual(parsed, {
          user: { title: 'Updated Title', description: 'User Description' },
        })
      })
    })

    suite('with flat JSON structure', () => {
      setup(() => {
        service = new ResourceService()
        service.setTestModule(
          [
            {
              relativePath: 'src/locale/en.json',
              content: '{"user.title":"User Title","user.description":"User Description"}',
            },
            {
              relativePath: 'src/locale/ru.json',
              content: '{"user.title":"Заголовок пользователя","user.description":"Описание пользователя"}',
            },
          ],
          { globPattern: 'src/locale/*.json', layout: '{locale}.json', sortKeys: true },
        )
      })

      test('getFlatTranslationsPerLocale returns flat structure', () => {
        const result = service.getFlatTranslationsPerLocale()
        assert.deepStrictEqual(result, {
          en: { 'user.title': 'User Title', 'user.description': 'User Description' },
          ru: { 'user.title': 'Заголовок пользователя', 'user.description': 'Описание пользователя' },
        })
      })

      test('updateValue updates flat structure', () => {
        const changes = service.view('default')!.manager.updateValue('user.title', { en: 'Updated Title' })

        assert.strictEqual(changes.size, 1)
        const parsed = JSON.parse(changes.get('src/locale/en.json')!)
        assert.deepStrictEqual(parsed, {
          'user.title': 'Updated Title',
          'user.description': 'User Description',
        })
      })
    })
  })

  suite('Structure 2: Locale folders with namespaced files', () => {
    setup(() => {
      service = new ResourceService()
      service.setTestModule(
        [
          { relativePath: 'src/i18n/en/common.json', content: '{"title":"Title","greeting":{"hello":"Hello"}}' },
          { relativePath: 'src/i18n/en/auth.json', content: '{"login":"Login","signup":"Sign Up"}' },
          { relativePath: 'src/i18n/ru/common.json', content: '{"title":"Заголовок","greeting":{"hello":"Привет"}}' },
          { relativePath: 'src/i18n/ru/auth.json', content: '{"login":"Войти","signup":"Регистрация"}' },
        ],
        { globPattern: 'src/i18n/**/*.json', layout: '{locale}/{namespace}.json', defaultNs: 'common', sortKeys: true },
      )
    })

    test('extracts correct namespaces', () => {
      const namespaces = service.namespaces
      assert.deepStrictEqual(namespaces.sort(), ['auth', 'common'].sort())
    })

    test('getFlatTranslationsPerLocale works with default namespace', () => {
      const result = service.getFlatTranslationsPerLocale('common')
      assert.deepStrictEqual(result, {
        en: { title: 'Title', 'greeting.hello': 'Hello' },
        ru: { title: 'Заголовок', 'greeting.hello': 'Привет' },
      })
    })

    test('getFlatTranslationsPerLocale works with specific namespace', () => {
      const result = service.getFlatTranslationsPerLocale('auth')
      assert.deepStrictEqual(result, {
        en: { login: 'Login', signup: 'Sign Up' },
        ru: { login: 'Войти', signup: 'Регистрация' },
      })
    })

    test('getTranslationsPerKeypath aggregates per namespace', () => {
      const resultCommon = service.getTranslationsPerKeypath('common')
      assert.deepStrictEqual(resultCommon, {
        title: { en: 'Title', ru: 'Заголовок' },
        greeting: {
          hello: { en: 'Hello', ru: 'Привет' },
        },
      })

      const resultAuth = service.getTranslationsPerKeypath('auth')
      assert.deepStrictEqual(resultAuth, {
        login: { en: 'Login', ru: 'Войти' },
        signup: { en: 'Sign Up', ru: 'Регистрация' },
      })
    })

    test('updateValue updates correct namespace file', () => {
      const changes = service.view('default')!.manager.updateValue('login', { en: 'Sign In' }, 'auth')

      assert.strictEqual(changes.size, 1)
      const parsed = JSON.parse(changes.get('src/i18n/en/auth.json')!)
      assert.deepStrictEqual(parsed, { login: 'Sign In', signup: 'Sign Up' })
    })
  })

  suite('ideFramework', () => {
    const seed = (framework: 'vue-i18n' | 'laravel') => {
      service = new ResourceService()
      service.setTestModule([{ relativePath: 'src/locale/en.json', content: '{}' }], {
        globPattern: 'src/locale/*.json',
        framework,
      })
    }

    test('uses the module framework when it has a shared ideInsert', () => {
      seed('vue-i18n')
      assert.strictEqual(service.ideInsertFramework(), 'vue-i18n')
      assert.strictEqual(service.ideInsertFramework('default'), 'vue-i18n')
    })

    test('uses laravel now that it has its own shared ideInsert', () => {
      seed('laravel')
      assert.strictEqual(service.ideInsertFramework(), 'laravel')
    })
  })

  suite('Structure 3: Locale folders with nested namespace paths (next-intl style)', () => {
    setup(() => {
      service = new ResourceService()
      service.setTestModule(
        [
          { relativePath: 'src/i18n/en/dashboard/settings.json', content: '{"title":"Settings","theme":"Theme"}' },
          { relativePath: 'src/i18n/en/dashboard/profile.json', content: '{"title":"Profile","username":"Username"}' },
          { relativePath: 'src/i18n/ru/dashboard/settings.json', content: '{"title":"Настройки","theme":"Тема"}' },
          {
            relativePath: 'src/i18n/ru/dashboard/profile.json',
            content: '{"title":"Профиль","username":"Имя пользователя"}',
          },
        ],
        { globPattern: 'src/i18n/**/*.json', layout: '{locale}/dashboard/{namespace}.json', sortKeys: true },
      )
    })

    test('extracts correct compound namespaces', () => {
      const namespaces = service.namespaces
      assert.deepStrictEqual(namespaces.sort(), ['profile', 'settings'].sort())
    })

    test('getFlatTranslationsPerLocale works with namespace', () => {
      const result = service.getFlatTranslationsPerLocale('settings')
      assert.deepStrictEqual(result, {
        en: { title: 'Settings', theme: 'Theme' },
        ru: { title: 'Настройки', theme: 'Тема' },
      })
    })

    test('updateValue updates correct namespace file', () => {
      const changes = service.view('default')!.manager.updateValue('title', { en: 'User Profile' }, 'profile')

      assert.strictEqual(changes.size, 1)
      const parsed = JSON.parse(changes.get('src/i18n/en/dashboard/profile.json')!)
      assert.deepStrictEqual(parsed, { title: 'User Profile', username: 'Username' })
    })
  })
})
