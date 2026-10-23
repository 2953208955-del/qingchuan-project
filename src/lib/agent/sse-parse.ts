import type { AgentEvent } from './types'

// Splits a stream buffer into complete SSE events. The trailing fragment is
// returned as `rest` so the caller can prepend the next chunk. A malformed
// event is dropped rather than aborting the whole stream: one bad frame must
// not take the live timeline down with it.
export function parseSseChunk(buffer: string): { events: AgentEvent[]; rest: string } {
  // Proxies and some servers frame events with CRLF; normalise so the framing
  // split works and the returned rest stays consistent across chunks.
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n')
  const rest = parts.pop() ?? ''
  const events: AgentEvent[] = []
  for (const part of parts) {
    // SSE concatenates multiple `data:` lines with a newline.
    const data = part
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
    if (!data) continue
    try {
      events.push(JSON.parse(data) as AgentEvent)
    } catch {
      // Incomplete or malformed JSON: ignore this event.
    }
  }
  return { events, rest }
}
