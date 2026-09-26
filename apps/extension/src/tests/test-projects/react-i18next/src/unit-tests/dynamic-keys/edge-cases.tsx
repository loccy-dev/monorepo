import { SignInError } from './sign-in-error';

declare function t(key: string): string;

type Size = 'sm' | 'lg';

const labels = {
  Title: 'title',
  Body: 'body',
} as const;

const sizes = ['sm', 'lg'] as const;

function getMode(): 'light' | 'dark' {
  return Math.random() > 0.5 ? 'light' : 'dark';
}

export function EdgeCases(size: Size, labelKey: keyof typeof labels, index: number, maybe?: 'x') {
  const mode = getMode();

  return [
    t(`alias.${size}`),
    t(`keyof.${labelKey}`),
    t(`member.${SignInError.Network}`),
    t(`tuple.${sizes[index]}`),
    t(`call.${mode}`),
    t(`or.${maybe || 'y'}`),
  ];
}
