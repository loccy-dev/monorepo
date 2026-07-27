import * as assert from 'assert'
import { textBoundaryDetector } from '../helpers/text-boundary-detector'

suite('Word bounds', () => {
  test('JS, double quote, const', () => {
    const text = '\nconst msg = "hello world";\n'
    const textRange = [14, 25]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'hello world',
      })
    }
  })

  test('JS, single quote, fn call', () => {
    const text = "\nlogger.info('Version Check:');\n"
    const textRange = [14, 28]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'Version Check:',
      })
    }
  })

  test('Inside html tag', () => {
    const text = '\n<h1>Title</h1>\n'
    const textRange = [5, 10]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'Title',
      })
    }
  })

  test('Empty quoted string', () => {
    const text = 'const empty = "";'
    const textRange = [15, 15]
    const result = textBoundaryDetector.findBounds(text, 15)
    assert.deepStrictEqual(result, {
      start: textRange[0],
      end: textRange[1],
      text: '',
    })
  })

  test('String at beginning of text', () => {
    const text = '"start here" and more text'
    const textRange = [1, 11]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'start here',
      })
    }
  })

  test('String at end of text', () => {
    const text = 'some text "end here"'
    const textRange = [11, 19]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'end here',
      })
    }
  })

  test('Template literal with backticks', () => {
    const text = 'const msg = `Hello ${name}!`;'
    const textRange = [13, 27]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'Hello ${name}!',
      })
    }
  })

  test('String with unicode and special characters', () => {
    const text = 'const unicode = "Hello 🌍 café résumé";'
    const textRange = [17, 37]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'Hello 🌍 café résumé',
      })
    }
  })

  test('Adjacent quoted strings', () => {
    const text = 'const combined = "first" + "second";'
    const firstRange = [18, 23]
    const secondRange = [28, 34]

    for (let i = firstRange[0]; i <= firstRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: firstRange[0],
        end: firstRange[1],
        text: 'first',
      })
    }

    for (let i = secondRange[0]; i <= secondRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: secondRange[0],
        end: secondRange[1],
        text: 'second',
      })
    }
  })

  test('Multi-line string content', () => {
    const text = `const multiline = \`Line 1
Line 2
Line 3\`;`
    const textRange = [19, 39]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'Line 1\nLine 2\nLine 3',
      })
    }
  })

  test('XML/HTML attribute value', () => {
    const text = '<img src="image.png" alt="A beautiful sunset" />'
    const textRange = [26, 44]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: 'A beautiful sunset',
      })
    }
  })

  test('String with only whitespace', () => {
    const text = 'const spaces = "   \t   ";'
    const textRange = [16, 23]
    for (let i = textRange[0]; i <= textRange[1]; i++) {
      const result = textBoundaryDetector.findBounds(text, i)
      assert.deepStrictEqual(result, {
        start: textRange[0],
        end: textRange[1],
        text: '   \t   ',
      })
    }
  })
})
