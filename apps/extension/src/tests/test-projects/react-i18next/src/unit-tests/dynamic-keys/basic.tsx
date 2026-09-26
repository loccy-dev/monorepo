import type { SaveOrCancel } from './save-or-cancel';

declare function t(key: string): string;

enum Direction {
  Up = 'up',
  Down = 'down',
}

export function Basic(props: { prefix: 'dashboard' | 'settings'; action: SaveOrCancel; anyValue: string }) {
  const cancel = 'cancel';
  let saveOrCancel: 'save' | 'cancel' = 'save';
  if (Math.random() > 0.5) {
    saveOrCancel = 'cancel';
  }
  const upOrDown = Math.random() > 0.5 ? 'up' : 'down';
  const direction: Direction = Math.random() > 0.5 ? Direction.Up : Direction.Down;
  const maybeLabel: 'label' | undefined = Math.random() > 0.5 ? 'label' : undefined;
  const flag = Math.random() > 0.5;

  return [
    t('static.' + cancel),
    t('literal.union.' + saveOrCancel),
    t(`template.${saveOrCancel}.suffix`),
    t(`const.${upOrDown}`),
    t(`enum.${direction}`),
    t(`imported.${props.action}`),
    t(`${props.prefix}.title`),
    t(`inline.${flag ? 'yes' : 'no'}`),
    t(`nullish.${maybeLabel ?? 'fallback'}`),
    t(`nonNull.${maybeLabel!}`),
    t(`multi.${upOrDown}.${saveOrCancel}`),
    t(`unknown.${props.anyValue}`),
  ];
}
