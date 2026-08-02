import { recordStdin } from './debug-log'

/**
 * Stdin is a pipe carrying a JSON payload already in hand, so it closes at once. A caller that
 * leaves it open instead would otherwise block the command forever, and a hung tool call is worse
 * than a short read: whatever arrived by then is parsed, and an empty read is the "no values yet"
 * case the commands already answer.
 */
const READ_TIMEOUT_MS = 5000

/** Everything piped in, or an empty string when stdin is a terminal (nothing was piped). */
export function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return Promise.resolve('')

  return new Promise((resolve, reject) => {
    let data = ''

    const finish = (): void => {
      clearTimeout(timer)
      process.stdin.pause()
      recordStdin(data)
      resolve(data)
    }
    const timer = setTimeout(finish, READ_TIMEOUT_MS)

    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', finish)
    process.stdin.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}
