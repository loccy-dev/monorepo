import * as vscode from 'vscode'
import { fileResolver } from '../file-resolver'

export async function detectDefaultsUseDoubleQuotes() {
  let useDoubleQuotes = false

  const uris = await fileResolver.getFileUris(['js', 'ts'].map((ext) => `**/*.${ext}`))

  for (const uri of uris) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri)
      const content = new TextDecoder('utf-8').decode(bytes)

      const singleQuotes = content.split('').filter((c) => c === "'").length
      const doubleQuotes = content.split('').filter((c) => c === '"').length
      if (singleQuotes + doubleQuotes >= 10 && singleQuotes !== doubleQuotes) {
        useDoubleQuotes = doubleQuotes > singleQuotes
        break
      }
    } catch {
      // best-effort sampling: skip files that can't be read
    }
  }

  return useDoubleQuotes
}
