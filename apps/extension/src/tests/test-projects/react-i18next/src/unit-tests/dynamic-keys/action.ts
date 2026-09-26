export const Action = {
  Save: 'save',
  Cancel: 'cancel',
} as const
export type Action = (typeof Action)[keyof typeof Action]
