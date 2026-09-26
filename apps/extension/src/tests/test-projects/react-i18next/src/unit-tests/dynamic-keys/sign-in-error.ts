export const SignInError = {
  InvalidEmail: 'invalidEmail',
  InvalidCode: 'invalidCode',
  ExpiredCode: 'expiredCode',
  RateLimited: 'rateLimited',
  Network: 'network',
  Unknown: 'unknown',
} as const;
export type SignInError = (typeof SignInError)[keyof typeof SignInError];
