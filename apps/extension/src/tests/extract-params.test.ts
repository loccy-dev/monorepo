import * as assert from 'assert'
import { extractParams } from '../helpers/extract-params'
import { resourceService } from '../helpers/resource-service'

suite('extractParams', () => {
  // Isolate from other suites: extractParams reads the owning module's framework (custom → `{}`).
  suiteSetup(() => resourceService.setTestModule([], { framework: 'custom' }))
  suiteTeardown(() => resourceService.setTestModule([]))

  test('should extract a single parameter from a template literal', () => {
    const input = '`Hello, ${name}!`'
    const expected = {
      value: 'Hello, {name}!',
      params: { name: 'name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should extract multiple parameters from a template literal with expressions', () => {
    const input = '`Welcome, ${user.firstName}! You have ${notifications.count} new messages.`'
    const expected = {
      value: 'Welcome, {userFirstName}! You have {notificationsCount} new messages.',
      params: {
        userFirstName: 'user.firstName',
        notificationsCount: 'notifications.count',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle string concatenation with single quotes', () => {
    const input = "'Hello, ' + user.name + '!'"
    const expected = {
      value: 'Hello, {userName}!',
      params: { userName: 'user.name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle string concatenation with mixed single and double quotes', () => {
    const input = "'Hello ' + \"world\" + ', ' + name"
    const expected = {
      value: 'Hello world, {name}',
      params: { name: 'name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should extract parameters from Handlebars-style syntax', () => {
    const input = '`Hello, {{ name }}!`'
    const expected = {
      value: 'Hello, {name}!',
      params: { name: 'name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should extract parameters from JSX-style syntax', () => {
    const input = '`Hello, {name}!`'
    const expected = {
      value: 'Hello, {name}!',
      params: { name: 'name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle a mix of template literal and Handlebars syntax', () => {
    const input = '`Hello, {{ user.name }}! You have ${unreadMessages} messages.`'
    const expected = {
      value: 'Hello, {userName}! You have {unreadMessages} messages.',
      params: {
        userName: 'user.name',
        unreadMessages: 'unreadMessages',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle parameter name collisions by appending numbers', () => {
    const input = '`${user} and ${user}`'
    const expected = {
      value: '{user} and {user2}',
      params: {
        user: 'user',
        user2: 'user',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should return the original string and empty params if no parameters are found', () => {
    const input = "'Just a simple string.'"
    const expected = {
      value: 'Just a simple string.',
      params: {},
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should extract a single parameter from a function literal', () => {
    const input =
      '`${$formatCurrency(100, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} extra reward at the end of the month`'
    const expected = {
      value: '{formatCurrency} extra reward at the end of the month',
      params: {
        formatCurrency: '$formatCurrency(100, { minimumFractionDigits: 0, maximumFractionDigits: 0 })',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should extract a single parameter from a function literal (real example v2)', () => {
    const input = '`Sort entries: ${$t(localSortModes[currentSorting].titleKey)}`'
    const expected = {
      value: 'Sort entries: {t}',
      params: {
        t: '$t(localSortModes[currentSorting].titleKey)',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle deeply nested objects within an interpolation', () => {
    const input = '`The value is ${JSON.stringify({ a: 1, b: { c: 2 } })}!`'
    const expected = {
      value: 'The value is {stringify}!',
      params: {
        stringify: 'JSON.stringify({ a: 1, b: { c: 2 } })',
      },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should correctly parse multiline strings', () => {
    const input = '`Hello,\n  ${user.name}!`'
    const expected = {
      value: 'Hello, {userName}!',
      params: { userName: 'user.name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle an empty string input', () => {
    const input = ''
    const expected = {
      value: '',
      params: {},
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should handle empty placeholders', () => {
    const input = '`Hello, ${} and {{}}!`'
    const expected = {
      value: 'Hello, {} and {}!',
      params: {},
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should generate valid identifiers from expressions with special characters', () => {
    const input = "`The user's name is ${user['name']}.`"
    const expected = {
      value: "The user's name is {userName}.",
      params: { userName: "user['name']" },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })

  test('should wrap in relevant wrapper based on framework', () => {
    resourceService.setTestModule([], { framework: 'react-i18next' })

    const input = '`Hello, ${name}!`'
    const expected = {
      value: 'Hello, {{name}}!',
      params: { name: 'name' },
    }
    assert.deepStrictEqual(extractParams(input), expected)
  })
})
