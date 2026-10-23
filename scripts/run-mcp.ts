import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../src/mcp/server'

async function main() {
  const server = createMcpServer()
  await server.connect(new StdioServerTransport())
  console.error('qingchuan MCP server running on stdio')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
