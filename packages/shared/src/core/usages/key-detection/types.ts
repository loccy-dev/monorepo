import type { Loc } from '@repo/types/platform.types'
export type TFuncRegexData = {
  regexp: RegExp
  parseExpression: (expression: string) => ParsedExpression | null
}

export type RegexGroups = {
  expression?: string
}

export type ParsedExpression = {
  keypathExpression?: {
    content: string
    clean: string
  }
  keypathStatic?: string
  ns?: string
  /** i18next context from a string literal (`{ context: 'male' }`) — appends `_male` to the key. */
  contextStatic?: string
  /** i18next context from a variable (`{ context: gender }`) — resolved dynamically to fan out keys. */
  contextDynamic?: string
  /** i18next only — presence triggers plural key expansion (`_one`/`_other`/…); value itself unused. */
  count?: string
  /** i18next only — ordinal (1st, 2nd) vs cardinal plural categories. */
  ordinal?: boolean
}

// Interface for dynamic key resolver (to be implemented by consumer)
export interface DynamicKeyResolverInterface {
  resolveKey(expression: string, loc: Loc): Promise<string[]>
}
