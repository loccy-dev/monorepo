import { Action } from './action';

declare function t(key: string): string;

type Status = 'queued' | 'ready' | 'failed';

const STATUS_KEY: Record<Exclude<Status, 'failed'>, string> = {
  queued: 'status.queued',
  ready: 'status.ready',
};

const widened = {
  up: 'direction.up',
  down: 'direction.down',
};

const large = {
  first: 'section.entry.first',
  second: 'section.entry.second',
  third: 'section.entry.third',
  fourth: 'section.entry.fourth',
  fifth: 'section.entry.fifth',
  sixth: 'section.entry.sixth',
  seventh: 'section.entry.seventh',
  eighth: 'section.entry.eighth',
  ninth: 'section.entry.ninth',
  tenth: 'section.entry.tenth',
  eleventh: 'section.entry.eleventh',
  twelfth: 'section.entry.twelfth',
} as const;

const list = ['direction.up', 'direction.down'];

export function ElementAccess(
  props: { pages: Record<'home' | 'about', 'page.dashboard.title' | 'page.settings.title'> },
  status: Exclude<Status, 'failed'>,
  direction: keyof typeof widened,
  events: { 'on-save': 'cta.save'; 'on-cancel': 'cta.cancel' },
  event: 'on-save' | 'on-cancel',
  entry: keyof typeof large,
  action: keyof typeof Action,
  page: 'home' | 'about',
  untyped: Record<'home' | 'about', string>,
  index: number,
) {
  return [
    t(STATUS_KEY[status]),
    t(widened[direction]),
    t(events[event]),
    t(large[entry]),
    t(`cta.${Action[action]}`),
    t(props.pages[page]),
    t(untyped[page]),
    t(list[index]),
  ];
}
