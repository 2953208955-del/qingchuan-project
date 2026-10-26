import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createMcpServer, type McpDeps } from '@/mcp/server'

export interface McpSearchResult {
  noEvidence: boolean
  scope?: string[]
  clauses: {
    standardNo: string
    clauseNo: string
    title: string
    score: number
  }[]
}

export interface PlanningMcpClient {
  searchStandards(input: {
    query: string
    categories: string[]
  }): Promise<McpSearchResult>
  close(): Promise<void>
}

function textJson(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  const content: unknown = 'content' in result ? result.content : undefined
  if (!Array.isArray(content)) throw new Error('MCP tool returned no content')
  const block = content[0] as { type?: string; text?: string } | undefined
  if (block?.type !== 'text' || typeof block.text !== 'string') {
    throw new Error('MCP tool did not return text JSON')
  }
  return JSON.parse(block.text) as unknown
}

/**
 * Connect a real MCP client to the existing MCP server over the in-memory
 * transport. The planner uses this instead of importing the retrieval function
 * directly, so the planning tool path exercises the MCP protocol itself.
 */
export async function createInMemoryPlanningMcpClient(
  deps: McpDeps,
): Promise<PlanningMcpClient> {
  const server = createMcpServer(deps)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'qingchuan-planner', version: '1.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  return {
    async searchStandards(input) {
      const result = await client.callTool({
        name: 'search_standards',
        arguments: input,
      })
      return textJson(result) as McpSearchResult
    },
    async close() {
      await client.close()
      await server.close()
    },
  }
}
