import type { Action } from './action';

declare function t(key: string): string;

export function ActionButton({ action }: { action?: Action }) {
  return <button>{action ? t(`cta.${action}`) : null}</button>;
}
