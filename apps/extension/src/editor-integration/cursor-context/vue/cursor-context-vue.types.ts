export enum CursorContextVue {
  TEMPLATE_TAG = 'TEMPLATE_TAG', // Inside tag content: <p>|cursor|</p>
  TEMPLATE_ATTR = 'TEMPLATE_ATTR', // Inside HTML attribute: <img alt="|cursor|" />
  VUE_DIRECTIVE = 'VUE_DIRECTIVE',
  TEMPLATE_INTERPOLATION = 'TEMPLATE_INTERPOLATION',
  SCRIPT_SETUP = 'SCRIPT_SETUP',
  SCRIPT_OPTIONS = 'SCRIPT_OPTIONS',
  UNKNOWN = 'UNKNOWN',
}
