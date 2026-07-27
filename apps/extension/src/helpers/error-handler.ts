import * as vscode from 'vscode'
import { debounce } from 'lodash'
import { Logger } from './logger'
import { reportError } from '../telemetry/telemetry'

interface ErrorHandlerProps {
  e?: any // telemetry, logger
  internal?: string // telemetry, logger
  snackbar?: string // for user
}

function processErrorLogging(props: ErrorHandlerProps) {
  const logStr: string[] = []
  if (props.internal) {
    logStr.push(`[${props.internal}]`)
  }
  if (props.e && props.e.message) {
    logStr.push(`${props.e.message}`)
  }
  if (logStr.length) {
    Logger.error(logStr.join(' '))
  }
}

function createErrorDetails(props: ErrorHandlerProps, totalExecutions?: number): Record<string, string> {
  const details = {
    name: props.e?.name,
    message: props.e?.message,
    stack: props.e?.stack,
    internalMessage: props.internal,
    snackbarMessage: props.snackbar,
    totalExecutions: totalExecutions ? totalExecutions.toString() : undefined,
  }

  const nonEmptyValues = Object.fromEntries(Object.entries(details).filter(([, v]) => !!v))
  return nonEmptyValues
}

export function handleError(props: ErrorHandlerProps) {
  processErrorLogging(props)

  if (props.snackbar) {
    vscode.window.showErrorMessage(props.snackbar)
  }

  const allDetails = createErrorDetails(props)
  reportError(allDetails)
}

// ----
// Debounced version with execution counting

let executionCount = 0
let pendingErrors: ErrorHandlerProps[] = []

const debouncedErrorHandler = debounce(() => {
  const errorsToProcess = [...pendingErrors]
  const currentExecutionCount = executionCount
  pendingErrors = []

  // log every error
  errorsToProcess.forEach((props) => {
    processErrorLogging(props)
  })

  // snackbar to user - single
  const firstErrorWithSnackbar = errorsToProcess.find((props) => props.snackbar)
  if (firstErrorWithSnackbar?.snackbar) {
    vscode.window.showErrorMessage(firstErrorWithSnackbar.snackbar)
  }

  // cloud reporting - single
  const referenceError = errorsToProcess[0] || {}
  const allDetails = createErrorDetails(referenceError, currentExecutionCount)
  reportError(allDetails)
}, 500)

/** Error handling for error spam (like bulk file reading) */
export function handleErrorDebounced(props: ErrorHandlerProps) {
  executionCount++
  pendingErrors.push(props)
  debouncedErrorHandler()
}
