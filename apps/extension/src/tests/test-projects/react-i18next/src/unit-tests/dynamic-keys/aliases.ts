const pages = {
  dashboard: 'Dashboard',
  settings: 'Settings',
} as const
export type PageKey = keyof typeof pages

type UpOrDown = 'up' | 'down'
export type { UpOrDown as Movement }

const actions = {
  Save: 'save',
  Cancel: 'cancel',
} as const
export type ActionValue = typeof actions[keyof typeof actions]
