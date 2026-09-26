import type { Choice } from './choice';

declare function t(key: string): string;

export function ChoiceButton({ choice }: { choice: Choice }) {
  return <button>{t(`cta.${choice}`)}</button>;
}
