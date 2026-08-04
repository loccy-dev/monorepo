/** The directory every file shares, so a locale set reads as names rather than repeated path. */
function commonDir(files: string[]): string {
  if (files.length < 2) return ''

  const segments = files.map((file) => file.split('/').slice(0, -1))
  const shared: string[] = []
  for (let depth = 0; depth < Math.min(...segments.map((parts) => parts.length)); depth++) {
    const segment = segments[0]![depth]!
    if (!segments.every((parts) => parts[depth] === segment)) break
    shared.push(segment)
  }
  return shared.length ? `${shared.join('/')}/` : ''
}

/**
 * Paths as one line, the shared directory named once: `locales/{en.json, de.json}`. `max` is a
 * ceiling for the briefing, where a file per locale-namespace pair would bury everything else.
 */
export function collapsePaths(files: string[], max = Infinity): string {
  const dir = commonDir(files)
  const listed = files.slice(0, max).map((file) => file.slice(dir.length))
  const rest = files.length - listed.length

  const names = `${listed.join(', ')}${rest > 0 ? `, +${rest} more` : ''}`
  return dir ? `${dir}{${names}}` : names
}
