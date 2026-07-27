import { reactI18nextExtension } from './react-i18next'
import { vueI18nExtension } from './vue-i18n'
import { nextIntlExtension } from './next-intl'
import { laravelExtension } from './laravel'
import { springExtension } from './spring'
import { customExtension } from './custom'
import type { IdeFrameworkExtension } from './types'

const extensions = new Map<string, IdeFrameworkExtension>()

function register(extension: IdeFrameworkExtension): void {
  extensions.set(extension.id, extension)
}

/** The IDE editor extension for a framework, falling back to `custom` for frameworks without their
 *  own editor integration — they still get full scanning + value editing. */
export function getFrameworkExtension(id: string): IdeFrameworkExtension {
  return extensions.get(id) ?? customExtension
}

register(vueI18nExtension)
register(reactI18nextExtension)
register(nextIntlExtension)
register(laravelExtension)
register(springExtension)
register(customExtension)
