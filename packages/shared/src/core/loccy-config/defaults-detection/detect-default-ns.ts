import { NS_WITHOUT_NS } from '../../helpers/namespace.helpers'
import { mostCommon } from '../../helpers/helpers'
import { looksLikeNamespaceStructure } from '../../helpers/locale.helpers'
import { extractFileName } from '../../helpers/path.helpers'

/** Default-namespace detection shared by frameworks that derive it from resource file naming. */
export function detectDefaultNsFromResources(
  translationFileRelativePaths: string[],
  prioritizeNamespaces?: string[],
): string {
  if (translationFileRelativePaths.length === 0) {
    return NS_WITHOUT_NS
  }

  const namespacedFiles = translationFileRelativePaths.filter(looksLikeNamespaceStructure)

  if (namespacedFiles.length === 0) {
    return NS_WITHOUT_NS
  }

  // In namespace structure, the filename is the namespace name (e.g., common.json → "common")
  const namespaces = namespacedFiles.map((filePath) => extractFileName(filePath, false))

  if (prioritizeNamespaces) {
    for (const prioritized of prioritizeNamespaces) {
      if (namespaces.includes(prioritized)) {
        return prioritized
      }
    }
  }

  return mostCommon(namespaces) ?? NS_WITHOUT_NS
}
