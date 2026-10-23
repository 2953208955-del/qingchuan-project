import type { AgentEvent } from './types'

export function encodeSse(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
}
