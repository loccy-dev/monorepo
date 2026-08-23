export interface Loc {
  start: number
  end: number
  line: number
}

/** Dirs every Platform adapter (node + vscode) and file watcher excludes from discovery — one
 *  canonical list so IDE and CLI detection can never drift. */
export const DEFAULT_IGNORE_GLOBS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/.output/**',
  '**/.svelte-kit/**',
  '**/.vercel/**',
  '**/.turbo/**',
  '**/coverage/**',
]

// Platform abstraction for cross-environment support
export interface Platform {
  rootPath: string

  // path is relative to root everywhere
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string): Promise<void>
  /** Missing file is not an error: the point is that it is gone afterwards. */
  deleteFile(relativePath: string): Promise<void>
  exists(relativePath: string): Promise<boolean>
  /** `exclude` adds to `DEFAULT_IGNORE_GLOBS`, which every adapter applies on its own. */
  findFiles(patterns: string[], exclude?: string[]): Promise<string[]>
}
