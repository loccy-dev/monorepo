import { qualifyKey } from '@repo/shared/core/helpers/namespace.helpers'
import { fail, type ModuleContext } from './context'

const SHOWN_DESCENDANTS = 5

/**
 * Refuse a write whose keypath collides with the tree it lands in: a message cannot sit where a
 * group of messages sits, and vice versa. Writing anyway would drop the whole subtree, or the
 * parent, in one silent step, and the write would never report it. A batch is checked against its
 * own keys too, since those land in the same tree. One namespace per call, so one tree.
 *
 * `vacated` is what the same call takes out of that tree, which a rename does: measured against the
 * old key still standing there, `c` -> `c.label` reads as a conflict the rename itself resolves.
 */
export function failOnStructuralCollision(
  ctx: ModuleContext,
  ns: string,
  keypaths: string[],
  vacated: string[] = [],
): void {
  const existing = Object.keys(ctx.rm.getFlatTranslationsPerKeypath(ns)).filter((keypath) => !vacated.includes(keypath))

  for (const keypath of keypaths) {
    const siblings = keypaths.filter((other) => other !== keypath)
    const tree = [...existing, ...siblings]

    const descendants = [...new Set(tree.filter((other) => other.startsWith(`${keypath}.`)))]
    if (descendants.length) {
      fail(
        `error: "${qualifyKey(ns, keypath)}" is a group of ${descendants.length} message(s), not a message`,
        ...descendants.slice(0, SHOWN_DESCENDANTS).map((d) => `  ${qualifyKey(ns, d)}`),
        ...(descendants.length > SHOWN_DESCENDANTS ? [`  ... ${descendants.length - SHOWN_DESCENDANTS} more`] : []),
        '  writing here would delete every one of them, so pick a keypath below this one instead',
      )
    }

    const ancestor = tree.find((other) => keypath.startsWith(`${other}.`))
    if (ancestor) {
      fail(
        `error: "${qualifyKey(ns, ancestor)}" is already a message, so nothing can nest under it`,
        `  rename it out of the way first, or pick a keypath that is not below it`,
      )
    }
  }
}
