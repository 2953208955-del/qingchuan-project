import { AI_CALL_TIMEOUT_MS } from './providers'

// This deployment's link to DashScope intermittently drops the first
// connections (UND_ERR_CONNECT_TIMEOUT / UND_ERR_SOCKET). A transport-level
// retry is distinct from retrying a bad model answer: a response that arrives
// is returned as-is so the caller still fails fast on 4xx/5xx.
export const TRANSPORT_ATTEMPTS = 4

export async function postJsonWithTransportRetry(
  url: string,
  apiKey: string,
  body: unknown,
  attempts = TRANSPORT_ATTEMPTS,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
      })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}
