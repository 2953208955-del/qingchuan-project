import type { Severity } from '@/lib/domain/schemas'

export interface RiverProfile {
  riverId: string
  name: string
  lengthKm: number
  mock: boolean
}

export interface WorkOrder {
  ticketId: string
  severity: Severity
  mock: boolean
}

export interface InspectionTools {
  getRiverProfile(input: { riverId: string }): Promise<RiverProfile>
  createWorkOrder(input: { runId: string; severity: Severity }): Promise<WorkOrder>
}

/**
 * Shared implementations for the optional tools. The MCP server and the web
 * orchestrator call the same functions so the two integration surfaces cannot
 * drift into different mock behaviour.
 */
export function createInspectionTools(): InspectionTools {
  return {
    async getRiverProfile({ riverId }) {
      return { riverId, name: '示例河段', lengthKm: 3.2, mock: true }
    },
    async createWorkOrder({ runId, severity }) {
      return { ticketId: `MOCK-${runId.slice(0, 8)}`, severity, mock: true }
    },
  }
}
