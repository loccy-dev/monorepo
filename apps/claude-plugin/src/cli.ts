import { traceInvocation } from './debug-log'
import { buildProgram } from './program'
import { workflow } from './tool-commands'

traceInvocation(process.argv)

// A bare invocation and -h/--help both print the workflow, which commander's own help would not
// cover: it lists the commands with the writing rules they operate under. `help <command>` is
// commander's, so only a bare `help` lands here.
const rootArg = process.argv[2]
const bareHelp = ['-h', '--help', 'help'].includes(rootArg ?? '') && process.argv.length === 3

if (!rootArg || bareHelp) {
  console.log(workflow())
  process.exit(0)
}

// Commander does not await its action handlers, so an async failure would otherwise surface as an
// unhandled rejection: a raw stack trace over bundled frames, which says nothing about the project.
buildProgram()
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  })
