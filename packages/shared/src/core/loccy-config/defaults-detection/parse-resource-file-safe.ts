import type { Platform } from '@repo/types/platform.types'
import { extractFileExt } from '../../helpers/path.helpers'
import { getResourceFormatByExt, parseResourceFile } from '../../registry'
import type { ResourceDocument } from '../../contracts'

/** Best-effort resource-file parse: `null` on unrecognized extension, read failure, empty/unparseable content. */
export async function parseResourceFileSafe(platform: Platform, filePath: string): Promise<ResourceDocument | null> {
  try {
    const format = getResourceFormatByExt(extractFileExt(filePath))
    if (!format) return null

    const content = await platform.readFile(filePath)
    if (!content.trim()) return null

    const doc = parseResourceFile(format, content)
    if (!Object.keys(doc.data).length) return null

    return doc
  } catch {
    return null
  }
}
