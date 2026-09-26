import * as assert from 'assert'
import { NS_WITHOUT_NS } from '@repo/shared/core/helpers/namespace.helpers'
import { resourceService } from '../helpers/resource-service'
import { resolveKeypathRenames, type RenameTarget } from '../commands/rename-keypaths-cmd'

const HEADER = '// header\n// another header line\n\n'

function target(keypath: string): RenameTarget {
  return { keypath, namespace: NS_WITHOUT_NS }
}

suite('renameKeypaths', () => {
  const targets = [target('salesOrder.shippingAddress'), target('salesOrder.shippingAddressNotSet.$feedback')]

  setup(() => {
    resourceService.setTestModule(
      [
        {
          relativePath: 'locales/en.json',
          content: JSON.stringify({
            salesOrder: { shippingAddress: 'Address', shippingAddressNotSet: { $feedback: 'No address' } },
            other: 'Other',
          }),
        },
        {
          relativePath: 'locales/de.json',
          content: JSON.stringify({
            salesOrder: { shippingAddress: 'Lieferadresse', shippingAddressNotSet: { $feedback: 'Keine Adresse' } },
            other: 'Andere',
          }),
        },
      ],
      { globPattern: 'locales/*.json', sortKeys: true },
    )
  })

  suite('resolveKeypathRenames', () => {
    test('maps edited lines to keys by position, skipping unchanged ones', () => {
      const text = `${HEADER}shipping.address\nsalesOrder.shippingAddressNotSet.$feedback\n`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), {
        renames: [
          {
            from: 'salesOrder.shippingAddress',
            to: 'shipping.address',
            namespace: NS_WITHOUT_NS,
            moduleName: undefined,
          },
        ],
      })
    })

    test('no edits resolve to no renames', () => {
      const text = `${HEADER}salesOrder.shippingAddress\nsalesOrder.shippingAddressNotSet.$feedback`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), { renames: [] })
    })

    test('rejects a removed line', () => {
      assert.deepStrictEqual(resolveKeypathRenames(targets, `${HEADER}shipping.address\n\n`), {
        error: 'Expected 2 keys, got 1',
        details: ['Keep one key per line, in the original order.'],
      })
    })

    test('rejects an added line', () => {
      assert.deepStrictEqual(resolveKeypathRenames(targets, `${HEADER}a\nb\nc`), {
        error: 'Expected 2 keys, got 3',
        details: ['Keep one key per line, in the original order.'],
      })
    })

    test('rejects a collision with an existing key', () => {
      const text = `${HEADER}other\nsalesOrder.shippingAddressNotSet.$feedback`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), {
        error: "Can't rename: 1 invalid key",
        details: ['salesOrder.shippingAddress → other: Keypath already exists'],
      })
    })

    test('rejects two keys renamed to the same keypath', () => {
      const text = `${HEADER}shipping.same\nshipping.same`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), {
        error: "Can't rename: 2 invalid keys",
        details: [
          'salesOrder.shippingAddress → shipping.same: Keypath already exists',
          'salesOrder.shippingAddressNotSet.$feedback → shipping.same: Keypath already exists',
        ],
      })
    })

    test('rejects swapping keys, since each new keypath still exists', () => {
      const text = `${HEADER}salesOrder.shippingAddressNotSet.$feedback\nsalesOrder.shippingAddress`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), {
        error: "Can't rename: 2 invalid keys",
        details: [
          'salesOrder.shippingAddress → salesOrder.shippingAddressNotSet.$feedback: Keypath already exists',
          'salesOrder.shippingAddressNotSet.$feedback → salesOrder.shippingAddress: Keypath already exists',
        ],
      })
    })

    test('rejects nesting a new key inside another new key', () => {
      const text = `${HEADER}shipping\nshipping.feedback`

      assert.deepStrictEqual(resolveKeypathRenames(targets, text), {
        error: "Can't rename: 2 invalid keys",
        details: [
          'salesOrder.shippingAddress → shipping: Can not use parent node as new keypath',
          'salesOrder.shippingAddressNotSet.$feedback → shipping.feedback: Can not nest inside existing keypath',
        ],
      })
    })
  })

  suite('renamedFileContents', () => {
    test('applies every rename to each file once', () => {
      const changed = resourceService.renamedFileContents([
        { from: 'salesOrder.shippingAddress', to: 'shipping.address' },
        { from: 'salesOrder.shippingAddressNotSet.$feedback', to: 'shipping.addressNotSet.$feedback' },
      ])

      assert.deepStrictEqual([...changed.keys()], ['locales/en.json', 'locales/de.json'])
      assert.deepStrictEqual(JSON.parse(changed.get('locales/en.json')!), {
        other: 'Other',
        shipping: { address: 'Address', addressNotSet: { $feedback: 'No address' } },
      })
      assert.deepStrictEqual(JSON.parse(changed.get('locales/de.json')!), {
        other: 'Andere',
        shipping: { address: 'Lieferadresse', addressNotSet: { $feedback: 'Keine Adresse' } },
      })
    })
  })
})
