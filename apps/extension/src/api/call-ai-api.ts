import { Logger } from '../helpers/logger'
import { getAuthHeaders } from '../helpers/auth/auth'
import { cfg } from '../global-config'
import { AiAction, AiResponse } from '@repo/types/ai-action.types'
// Nitro serializes errors as `{ statusCode, statusMessage, message }` — branch on `response.status`, never a body `code`.
async function postJson(endpoint: string, body: object): Promise<any> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null)
  Logger.debug('response', result)
  if (!response.ok) {
    // eslint-disable-next-line no-throw-literal
    throw { status: response.status, message: result?.message || result?.statusMessage || 'API error' }
  }
  return result
}

export async function callAiApi<T>(action: AiAction, payload: object): Promise<AiResponse<T> | null> {
  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, v]) => !!v))
  Logger.debug('request', { payload: cleanPayload, action })
  const result = await postJson(`${cfg.webAppDomain}/api/vscode/ai`, { action, payload: cleanPayload })
  return (result ?? null) as AiResponse<T> | null
}
