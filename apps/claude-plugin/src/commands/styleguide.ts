import { STYLEGUIDE_EXAMPLE_YAML } from '@repo/shared/core/loccy-config/styleguide-example'

/**
 * A worked styleguide to author against, which a project whose own is still empty has nothing else
 * to look at. Every field and every value shape appears exactly once, so it stands in for the
 * schema without anyone having to read one.
 */
export function styleguideExampleCommand(): void {
  console.log(STYLEGUIDE_EXAMPLE_YAML)
}
