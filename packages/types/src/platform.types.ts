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
]

// Platform abstraction for cross-environment support
export interface Platform {
  rootPath: string

  // path is relative to root everywhere
  // everyone ignores gitignored files by default where possible
  readFile(relativePath: string): Promise<string>
  writeFile(relativePath: string, content: string): Promise<void>
  /** Missing file is not an error: the point is that it is gone afterwards. */
  deleteFile(relativePath: string): Promise<void>
  exists(relativePath: string): Promise<boolean>
  findFiles(patterns: string[], exclude?: string[]): Promise<string[]>
}
