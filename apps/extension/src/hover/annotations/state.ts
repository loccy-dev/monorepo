import * as vscode from 'vscode'

// if doc version changes mid-calculation, postpone rendering until typing stops — avoids stale-position annotations
export const pendingDocument = {
  uri: null as vscode.Uri | null,
  version: -1,
}
