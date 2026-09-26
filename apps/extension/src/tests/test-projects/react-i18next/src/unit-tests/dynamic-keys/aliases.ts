const sections = {
  Header: 'header',
  Footer: 'footer',
} as const
export type SectionKey = keyof typeof sections

const statuses = {
  Active: 'active',
  Archived: 'archived',
} as const
export type Status = typeof statuses[keyof typeof statuses]
