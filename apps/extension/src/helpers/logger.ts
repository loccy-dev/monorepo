import * as vscode from 'vscode'

export class Logger {
  static channel: vscode.OutputChannel

  static getTimestamp() {
    return new Date().toISOString().split('T')[1].slice(0, -1)
  }

  static createChannel() {
    if (!this.channel) {
      this.channel = vscode.window.createOutputChannel('Loccy')
    }
  }

  static info(message: string) {
    this.createChannel()
    this.channel.appendLine(`${Logger.getTimestamp()} [INFO] ${message}`)
  }

  static warn(message: string) {
    this.createChannel()
    this.channel.appendLine(`${Logger.getTimestamp()} [WARN] ${message}`)
  }

  static error(message: string) {
    this.createChannel()
    this.channel.appendLine(`${Logger.getTimestamp()} [ERROR] ${message}`)
  }

  static debug(title: string, ...message: any) {
    if (!process.env.LOCCY_DEBUG) {
      return
    }

    this.createChannel()
    this.channel.appendLine(`${Logger.getTimestamp()} [DEBUG] ${JSON.stringify({ ...message })}`)
    console.log(`🪲 [${Logger.getTimestamp()}] (${title})`, ...message)
  }
}
