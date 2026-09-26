import type { SignInError } from './sign-in-error';

declare function t(key: string): string;

export function SignIn({ error }: { error?: SignInError }) {
  return <p>{error ? t(`signIn.errors.${error}`) : null}</p>;
}
