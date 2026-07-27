import * as vscode from 'vscode'

class VirtualFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>()

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._onDidChangeFile.event

  private virtualFiles: Map<string, Uint8Array> = new Map()

  stat(uri: vscode.Uri): vscode.FileStat {
    return {
      type: vscode.FileType.File,
      ctime: Date.now(),
      mtime: Date.now(),
      size: this.virtualFiles.get(uri.path)?.byteLength || 0,
    }
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return this.virtualFiles.get(uri.path) || new Uint8Array(0)
  }

  writeFile(uri: vscode.Uri, content: Uint8Array): void {
    this.virtualFiles.set(uri.path, content)
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Changed, uri }])
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {})
  }
  readDirectory(): [string, vscode.FileType][] {
    return []
  }
  createDirectory(): void {}
  delete(): void {}
  rename(): void {}

  clearFile(uri: vscode.Uri) {
    this.virtualFiles.delete(uri.path)
    this._onDidChangeFile.fire([{ type: vscode.FileChangeType.Deleted, uri }])
  }
}

let provider: VirtualFileSystemProvider | null = null

export function registerVirtualSystemProvider() {
  if (!provider) {
    provider = new VirtualFileSystemProvider()
    vscode.workspace.registerFileSystemProvider('loccy', provider)
  }
  return provider
}
