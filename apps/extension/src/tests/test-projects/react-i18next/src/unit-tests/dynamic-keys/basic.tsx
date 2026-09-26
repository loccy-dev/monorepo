import type { SaveOrCancel } from './save-or-cancel';

declare function t(key: string): string;

enum Direction {
  Up = 'up',
  Down = 'down',
}

export function Basic(props: {
  section: 'page.dashboard' | 'page.settings';
  action: SaveOrCancel;
  anyValue: string;
}) {
  const cancel = 'cancel';
  let saveOrCancel: 'save' | 'cancel' = 'save';
  if (Math.random() > 0.5) {
    saveOrCancel = 'cancel';
  }
  let page: 'dashboard' | 'settings' = 'dashboard';
  if (Math.random() > 0.5) {
    page = 'settings';
  }
  const upOrDown = Math.random() > 0.5 ? 'up' : 'down';
  const direction: Direction = Math.random() > 0.5 ? Direction.Up : Direction.Down;
  const field = Math.random() > 0.5 ? 'title' : 'subtitle';
  const maybeSave: 'save' | undefined = Math.random() > 0.5 ? 'save' : undefined;
  const flag = Math.random() > 0.5;

  return [
    t('cta.' + cancel),
    t('cta.' + saveOrCancel),
    t(`page.${page}.title`),
    t(`direction.${upOrDown}`),
    t(`direction.${direction}`),
    t(`cta.${props.action}`),
    t(`${props.section}.title`),
    t(`cta.${flag ? 'save' : 'cancel'}`),
    t(`cta.${maybeSave ?? 'cancel'}`),
    t(`cta.${maybeSave!}`),
    t(`page.${page}.${field}`),
    t(`cta.${props.anyValue}`),
  ];
}
