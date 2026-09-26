import { Action } from './action';
import type { ActionValue, Movement, PageKey } from './aliases';

declare function t(key: string): string;

type Direction = 'up' | 'down';

enum Level {
  Low,
  Medium,
}

enum Priority {
  Medium = 1,
  High,
}

const labels = {
  save: 'Save',
  cancel: 'Cancel',
} as const;

const directions = ['up', 'down'] as const;

function getDirection(): 'up' | 'down' {
  return Math.random() > 0.5 ? 'up' : 'down';
}

export function EdgeCases(
  direction: Direction,
  labelKey: keyof typeof labels,
  index: number,
  maybeUp: 'up' | undefined,
  page: PageKey,
  movement: Movement,
  actionValue: ActionValue,
  level: Level,
  priority: Priority,
) {
  const returned = getDirection();

  return [
    t(`direction.${direction}`),
    t(`cta.${labelKey}`),
    t(`cta.${Action.Cancel}`),
    t(`direction.${directions[index]}`),
    t(`direction.${returned}`),
    t(`direction.${maybeUp || 'down'}`),
    t(`page.${page}.title`),
    t(`direction.${movement}`),
    t(`cta.${actionValue}`),
    t(`level.${level}`),
    t(`level.${priority}`),
  ];
}
