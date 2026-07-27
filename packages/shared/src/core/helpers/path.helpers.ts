import { parse, dirname, join, normalize, isAbsolute } from 'pathe'

export function extractFileName(filePath: string, leaveExt = false) {
  const parsed = parse(filePath)
  return leaveExt ? parsed.base : parsed.name
}

export function extractFileExt(filePath: string) {
  const parsed = parse(filePath)
  return parsed.ext.slice(1)
}

export function extractDirname(filePath: string): string {
  return dirname(filePath)
}

export function joinPaths(path1: string, path2: string) {
  return join(path1, path2)
}

export function normalizePath(filePath: string) {
  return normalize(filePath)
}

export function isAbsolutePath(filePath: string) {
  return isAbsolute(filePath)
}

// Compute the static (non-glob) prefix shared across include patterns.
// E.g. ["data/*.json", "data/*.json5"] -> "data"
// E.g. ["data/workspace-models/**/*.json"] -> "data/workspace-models"
export function computeStaticPrefix(includes: string[]): string {
  if (includes.length === 0) return ''

  const staticParts = includes.map((p) => {
    const segments = p.split('/')
    const statics: string[] = []
    for (const seg of segments) {
      if (seg.includes('*') || seg.includes('{') || seg.includes('?') || seg.includes('[')) break
      statics.push(seg)
    }
    return statics
  })

  const shortest = Math.min(...staticParts.map((p) => p.length))
  const common: string[] = []
  for (let i = 0; i < shortest; i++) {
    const seg = staticParts[0]![i]!
    if (staticParts.every((p) => p[i] === seg)) {
      common.push(seg)
    } else {
      break
    }
  }
  return common.join('/')
}

/** Build keypath segments from file path, stripping the static prefix of include patterns */
export function filePathToSegments(relPath: string, includePatterns: string[]): string {
  const prefix = computeStaticPrefix(includePatterns)
  let stripped = relPath
  if (prefix && stripped.startsWith(prefix + '/')) {
    stripped = stripped.slice(prefix.length + 1)
  }
  const withoutExt = stripped.replace(/\.[^.]+$/, '')
  return withoutExt.replace(/\//g, '.')
}
