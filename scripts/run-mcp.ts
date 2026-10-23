import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer } from '../src/mcp/server'

const server = createMcpServer()
await server.connect(new StdioServerTransport())
console.error('qingchuan MCP server running on stdio')
