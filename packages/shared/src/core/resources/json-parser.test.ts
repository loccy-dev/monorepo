import { describe, it, expect } from 'vitest'
import { JsonParser } from './json-parser'
import * as treeOps from './nested-keypath-ops'

describe('JsonParser', () => {
  describe('treeOps.shouldRenameOnly', () => {
    const inputContent = '{"a":{"a":{"a":3},"b":2},"b":1}'
    let data = new JsonParser(inputContent).data

    it('a.a.a -> a.a.c', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'a.a.c')).toBe(true)
    })

    it('a.a.a -> a.c', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'a.c')).toBe(true)
    })

    it('a.a.a -> a.c.x.y', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'a.c.x.y')).toBe(true)
    })

    it('a.a.a -> b.a.a', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'b.a.a')).toBe(false)
    })

    it('a.a.a -> c.a.a', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'c.a.a')).toBe(false)
    })

    it('a.a.a -> x.y', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'x.y')).toBe(false)
    })

    it('a.a.a -> x.y.z', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'x.y.z')).toBe(false)
    })

    it('a.a.a -> x.y.z.n', () => {
      expect(treeOps.shouldRenameOnly(data, 'a.a.a', 'x.y.z.n')).toBe(false)
    })

    it('b.a -> c.b (different input)', () => {
      data = new JsonParser('{"a":"1","b":{"a":"2"}}').data
      expect(treeOps.shouldRenameOnly(data, 'b.a', 'c.b')).toBe(true)
    })
  })

  describe('parser.renameKeypath', () => {
    const inputContent = '{"a":{"a":{"a":3},"b":2},"b":1}'
    let parser = new JsonParser(inputContent, false)

    it('rename without movement in unsorted', () => {
      parser = new JsonParser('{"a":{"a":{"a":3,"b":3},"b":2},"b":1}', false)
      parser.renameKeypath('a.a.a', 'a.a.c.c')
      expect(parser.content).toBe('{"a":{"a":{"c":{"c":3},"b":3},"b":2},"b":1}')
    })

    it('a.a.a -> a.a.c', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'a.a.c')
      expect(parser.content).toBe('{"a":{"a":{"c":3},"b":2},"b":1}')
    })

    it('a.a.a -> a.c', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'a.c')
      expect(parser.content).toBe('{"a":{"c":3,"b":2},"b":1}')
    })

    it('a.a.a -> a.c.x.y', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'a.c.x.y')
      expect(parser.content).toBe('{"a":{"c":{"x":{"y":3}},"b":2},"b":1}')
    })

    it('a.a.a -> b.a.a', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'b.a.a')
      // illegal to rename, expecting original input
      expect(parser.content).toBe('{"a":{"a":{"a":3},"b":2},"b":1}')
    })

    it('a.a.a -> c.a.a', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'c.a.a')
      expect(parser.content).toBe('{"a":{"b":2},"b":1,"c":{"a":{"a":3}}}')
    })

    it('a.a.a -> x.y', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'x.y')
      expect(parser.content).toBe('{"a":{"b":2},"b":1,"x":{"y":3}}')
    })

    it('a.a.a -> x.y.z', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'x.y.z')
      expect(parser.content).toBe('{"a":{"b":2},"b":1,"x":{"y":{"z":3}}}')
    })

    it('a.a.a -> x.y.z.n', () => {
      parser = new JsonParser(inputContent, false)
      parser.renameKeypath('a.a.a', 'x.y.z.n')
      expect(parser.content).toBe('{"a":{"b":2},"b":1,"x":{"y":{"z":{"n":3}}}}')
    })

    it('b.a -> c.b (different input)', () => {
      parser = new JsonParser('{"a":"1","b":{"a":"2"}}', false)
      parser.renameKeypath('b.a', 'c.b')
      expect(parser.content).toBe('{"a":"1","c":{"b":"2"}}')
    })

    it('renameKeypath - 2nd latest level', () => {
      const parser = new JsonParser('{"k":"v1","k2":{"kk":"vv1"}}', true)
      parser.renameKeypath('k2.kk', 'k2.kk2')
      expect(parser.content).toBe('{"k":"v1","k2":{"kk2":"vv1"}}')
    })

    it('renameKeypath - all 2 levels', () => {
      const parser = new JsonParser('{"a":"1","b":{"a":"2"}}', true)
      parser.renameKeypath('b.a', 'c.b')
      expect(parser.content).toBe('{"a":"1","c":{"b":"2"}}')
    })

    it('moving from root to nested, with same name', () => {
      const parser = new JsonParser('{"a":{"a":"2","b":{"d":"1"},"x":"2"},"b":{"c":"1"}}', true)
      parser.renameKeypath('b.c', 'a.b.c')
      expect(parser.content).toBe('{"a":{"a":"2","b":{"c":"1","d":"1"},"x":"2"}}')
    })

    it('appending suffix', () => {
      const parser = new JsonParser('{"a":{"a":"2","b":{"d":"1"},"x":"2"},"b":{"c":"1"}}', true)
      parser.renameKeypath('b.c', 'b.c.d')
      expect(parser.content).toBe('{"a":{"a":"2","b":{"d":"1"},"x":"2"},"b":{"c":{"d":"1"}}}')
    })

    it('moving from nested to root, with same name', () => {
      const parser = new JsonParser('{"a":{"a":"2","b":{"c":"1","d":"1"},"x":"2"}}', true)
      parser.renameKeypath('a.b.c', 'b.c')
      expect(parser.content).toBe('{"a":{"a":"2","b":{"d":"1"},"x":"2"},"b":{"c":"1"}}')
    })

    it('renaming middle part to existing one', () => {
      const parser = new JsonParser('{"a":{"b":{"c":"1","d":"1"},"a":{"y":"1"},"x":"2"}}', true)
      parser.renameKeypath('a.a.y', 'a.b.y')
      expect(parser.content).toBe('{"a":{"b":{"c":"1","d":"1","y":"1"},"x":"2"}}')
    })

    it('renaming middle part to existing one no deleting', () => {
      const parser = new JsonParser('{"a":{"b":{"c":"1","d":"1"},"a":{"y":"1","z":"3"},"x":"2"}}', true)
      parser.renameKeypath('a.a.y', 'a.b.y')
      expect(parser.content).toBe('{"a":{"a":{"z":"3"},"b":{"c":"1","d":"1","y":"1"},"x":"2"}}')
    })

    it('renaming middle part to existing string value', () => {
      const parser = new JsonParser('{"a":{"b":{"c":"1","d":"1"},"a":{"y":"1"},"x":"2"}}', true)
      parser.renameKeypath('a.a.y', 'a.x.y')
      expect(parser.content).toBe('{"a":{"a":{"y":"1"},"b":{"c":"1","d":"1"},"x":"2"}}')
    })

    it('renaming middle part to existing object value', () => {
      const parser = new JsonParser('{"a":{"b":{"c":"1","d":"1"},"a":{"y":"1"},"x":"2"}}', true)
      parser.renameKeypath('a.a.y', 'a.b')
      expect(parser.content).toBe('{"a":{"a":{"y":"1"},"b":{"c":"1","d":"1"},"x":"2"}}')
    })

    it('structure - flat (keypath renaming and resorting)', () => {
      const parser = new JsonParser(
        `{
  "k2.kk": "vv1",
  "k2.kk2": "vv2",
  "k": "v1"
}`,
        true,
      )

      parser.renameKeypath('k2.kk', 'k3.kk3')

      expect(parser.content).toBe(
        `{
  "k": "v1",
  "k2.kk2": "vv2",
  "k3.kk3": "vv1"
}`,
      )
    })

    it('structure - flat (renaming to a parent keypath)', () => {
      const parser = new JsonParser(
        `{
  "address.label": "Address",
  "address.notSet": "Address not set"
}`,
        false,
      )

      parser.renameKeypath('address.label', 'address')

      expect(parser.content).toBe(
        `{
  "address": "Address",
  "address.notSet": "Address not set"
}`,
      )
    })

    it('structure - flat deep (keypath removing and not-resorting)', () => {
      const parser = new JsonParser(
        `{
  "k2.kk": "vv1",
  "k2.kk2": "vv2",
  "k3.kk.kkk": "vvv1",
  "k3.kk2.kkk2": "vvv2",
  "k3.kk3.kkk3": "vvv3",
  "k": "v1"
}`,
        false,
      )

      parser.deleteKeypath('k3.kk2.kkk2')

      expect(parser.content).toBe(
        `{
  "k2.kk": "vv1",
  "k2.kk2": "vv2",
  "k3.kk.kkk": "vvv1",
  "k3.kk3.kkk3": "vvv3",
  "k": "v1"
}`,
      )
    })

    describe('renameKeypath - nesting/unnesting', () => {
      it('nest inside itself - ok', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.a.a', 'b.a.a.a')
        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: {
                a: 3,
              },
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })

      it('nest inside itself twice - ok', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.a.a', 'b.a.a.a.a')
        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: {
                a: {
                  a: 3,
                },
              },
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })

      it('nest inside other leaf - illegal', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.a.a', 'b.b.a')
        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: 3,
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })

      it('nest inside other node - illegal', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.a.b', 'b.b')
        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: 3,
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })

      it('unnesting into parent, single child - ok', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.b.a', 'b.b')
        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: 3,
              b: 3,
            },
            b: 3,
            c: 2,
          },
          c: 1,
        })
      })

      it('unnesting into parent twice, single child - ok', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
              },
            },
            c: 1,
          }),
          true,
        )
        parser.renameKeypath('b.a.a', 'b')
        expect(parser.data).toEqual({
          a: 1,
          b: 3,
          c: 1,
        })
      })

      it('unnesting into parent, 2+ children - illegal', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )

        parser.renameKeypath('b.a.a', 'b.a')
        parser.renameKeypath('b.a.b', 'b.a')
        parser.renameKeypath('b.c', 'b')

        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: 3,
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })

      it('unnesting into parent, 2+ children, 2 char name - illegal', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              aa: {
                a: 3,
                b: 3,
              },
            },
            c: 1,
          }),
          true,
        )

        parser.renameKeypath('b.aa.a', 'b')

        expect(parser.data).toEqual({
          a: 1,
          b: {
            aa: {
              a: 3,
              b: 3,
            },
          },
          c: 1,
        })
      })

      it('unnesting into parent twice, 2+ children - illegal', () => {
        const parser = new JsonParser(
          JSON.stringify({
            a: 1,
            b: {
              a: {
                a: 3,
                b: 3,
              },
              b: {
                a: 3,
              },
              c: 2,
            },
            c: 1,
          }),
          true,
        )

        parser.renameKeypath('b.a.a', 'b')
        parser.renameKeypath('b.b.a', 'b')

        expect(parser.data).toEqual({
          a: 1,
          b: {
            a: {
              a: 3,
              b: 3,
            },
            b: {
              a: 3,
            },
            c: 2,
          },
          c: 1,
        })
      })
    })
  })

  describe('parser.updateValue', () => {
    it('updateValue - simple', () => {
      const parser = new JsonParser('{"k":"v1"}', true)
      parser.updateValue('k', 'v2')
      expect(parser.content).toBe('{"k":"v2"}')
    })

    it('updateValue - deep and formatted', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": "vv1"
  },
  "k2": "v2"
}`,
        true,
      )
      parser.updateValue('k.kk', 'vv2')
      expect(parser.content).toBe(
        `{
  "k": {
    "kk": "vv2"
  },
  "k2": "v2"
}`,
      )
    })

    it('new keypath in a flat file stays flat', () => {
      const parser = new JsonParser('{"a.b":"x","a.c":"y"}', false)
      parser.updateValue('a.d', 'z')
      expect(parser.content).toBe('{"a.b":"x","a.c":"y","a.d":"z"}')
    })

    it('new top-level keypath in a flat file stays flat', () => {
      const parser = new JsonParser('{"a.b":"x"}', false)
      parser.updateValue('c.d.e', 'z')
      expect(parser.content).toBe('{"a.b":"x","c.d.e":"z"}')
    })

    it('existing keypath in a flat file stays flat', () => {
      const parser = new JsonParser('{"a.b":"x","a.c":"y"}', false)
      parser.updateValue('a.b', 'z')
      expect(parser.content).toBe('{"a.b":"z","a.c":"y"}')
    })

    it('new keypath in a nested file stays nested', () => {
      const parser = new JsonParser('{"a":{"b":"x"}}', false)
      parser.updateValue('a.c', 'z')
      expect(parser.content).toBe('{"a":{"b":"x","c":"z"}}')
    })
  })

  describe('parser.deleteKeypath', () => {
    it('1st level', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": "vv1"
  },
  "k2": "v2"
}`,
        true,
      )

      const result = parser.deleteKeypath('k2')
      expect(result).toBe('v2')
      expect(parser.content).toBe(
        `{
  "k": {
    "kk": "vv1"
  }
}`,
      )
    })

    it('deep', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": "vv1"
  },
  "k2": "v2"
}`,
        true,
      )

      const result = parser.deleteKeypath('k.kk')
      expect(result).toBe('vv1')
      expect(parser.content).toBe(
        `{
  "k2": "v2"
}`,
      )
    })

    it('even deeper', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": {
      "kkk": "vvv1"
    },
    "kk2": {
      "kkk2": "vvv2"
    }
  },
  "k2": "v2"
}`,
        true,
      )

      const result = parser.deleteKeypath('k.kk2.kkk2')
      expect(result).toBe('vvv2')
      expect(parser.content).toBe(
        `{
  "k": {
    "kk": {
      "kkk": "vvv1"
    }
  },
  "k2": "v2"
}`,
      )
    })
  })

  describe('Formatting', () => {
    it('indent with 0 spaces', () => {
      const inputContent = '{"k":"v1"}'
      const parser = new JsonParser(inputContent, true)
      expect(parser.metadata.indentString).toBe('')
      expect(parser.content).toBe(inputContent)
    })

    it('indent with 2 spaces', () => {
      const inputContent = `{
  "k": {
    "kk": "vv1",
    "kk2": "vv2"
  }
}`
      const parser = new JsonParser(inputContent, true)
      expect(parser.metadata.indentString).toBe('  ')
      expect(parser.content).toBe(inputContent)
    })

    it('indent with 4 spaces', () => {
      const inputContent = `{
    "k": {
        "kk": "vv1",
        "kk2": "vv2"
    }
}`
      const parser = new JsonParser(inputContent, true)
      expect(parser.metadata.indentString).toBe('    ')
      expect(parser.content).toBe(inputContent)
    })

    it('indent 6 spaces', () => {
      const inputContent = `{
      "k": {
            "kk": "vv1",
            "kk2": "vv2"
      }
}`
      const parser = new JsonParser(inputContent, true)
      expect(parser.metadata.indentString).toBe('      ')
      expect(parser.content).toBe(inputContent)
    })

    it('indent 1 tab', () => {
      const inputContent = '{\n\t"key": "value",\n\t"nested": {\n\t\t"inner": "data"\n\t}\n}'
      const parser = new JsonParser(inputContent, false)
      expect(parser.metadata.indentString).toBe('\t')
      parser.renameKeypath('key', 'newKey')
      const outputContent = '{\n\t"newKey": "value",\n\t"nested": {\n\t\t"inner": "data"\n\t}\n}'
      expect(parser.content).toBe(outputContent)
    })

    it('trailing line', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": "vv1",
    "kk2": "vv2"
  }
}
`,
        true,
      )

      parser.deleteKeypath('k.kk2')

      expect(parser.content).toBe(
        `{
  "k": {
    "kk": "vv1"
  }
}
`,
      )
    })

    it('trailing lines', () => {
      const parser = new JsonParser(
        `{
  "k": {
    "kk": "vv1",
    "kk2": "vv2"
  }
}


`,
        true,
      )

      parser.deleteKeypath('k.kk2')

      expect(parser.content).toBe(
        `{
  "k": {
    "kk": "vv1"
  }
}


`,
      )
    })
  })

  describe('Sorting', () => {
    it(' resort unsorted', () => {
      const unsorted = `{
  "k": {
    "kk2": "vv2",
    "kk": "vv1"
  }
}`
      const sorted = `{
  "k": {
    "kk": "vv1",
    "kk2": "vv2"
  }
}`
      const parserSorted = new JsonParser(unsorted, true)
      expect(parserSorted.content).toBe(sorted)

      const parserUnsorted = new JsonParser(unsorted, false)
      expect(parserUnsorted.content).toBe(unsorted)
    })

    it('after change', () => {
      const input = `{
  "k": {
    "kk": "vv1",
    "kk2": "vv2"
  }
}`
      const sortedOutput = `{
  "k": {
    "kk2": "vv2",
    "kk3": "vv1"
  }
}`
      const unsortedOutput = `{
  "k": {
    "kk3": "vv1",
    "kk2": "vv2"
  }
}`

      const parserSorted = new JsonParser(input, true)
      parserSorted.renameKeypath('k.kk', 'k.kk3')
      expect(parserSorted.content).toBe(sortedOutput)

      const parserUnsorted = new JsonParser(input, false)
      parserUnsorted.renameKeypath('k.kk', 'k.kk3')
      expect(parserUnsorted.content).toBe(unsortedOutput)
    })
  })
})
