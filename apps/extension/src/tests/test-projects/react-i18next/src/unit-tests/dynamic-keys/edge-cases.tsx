import { SignInError } from './sign-in-error';
import type { SectionKey, Status, Tone } from './aliases';

declare function t(key: string): string;

type Size = 'sm' | 'lg';

enum Level {
  Low,
  High,
}

enum Priority {
  Normal = 5,
  Urgent,
}

const labels = {
  Title: 'title',
  Body: 'body',
} as const;

const sizes = ['sm', 'lg'] as const;

function getMode(): 'light' | 'dark' {
  return Math.random() > 0.5 ? 'light' : 'dark';
}

export function EdgeCases(
  size: Size,
  labelKey: keyof typeof labels,
  index: number,
  maybe: 'x' | undefined,
  section: SectionKey,
  tone: Tone,
  status: Status,
  level: Level,
  priority: Priority,
) {
  const mode = getMode();

  return [
    t(`alias.${size}`),
    t(`keyof.${labelKey}`),
    t(`member.${SignInError.Network}`),
    t(`tuple.${sizes[index]}`),
    t(`call.${mode}`),
    t(`or.${maybe || 'y'}`),
    t(`section.${section}`),
    t(`tone.${tone}`),
    t(`status.${status}`),
    t(`level.${level}`),
    t(`priority.${priority}`),
  ];
}
