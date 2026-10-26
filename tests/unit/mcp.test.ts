import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { createMcpServer, type McpDeps } from '@/mcp/server'
import { createDb } from '@/lib/db/client'
import { createRun, listAgentSteps, saveReport, updateRun } from '@/lib/db/repo'
import type { Embedder } from '@/lib/rag/embed'
import type { VisionPort } from '@/lib/vision/qwen'

async function withServer(deps: McpDeps, run: (client: Client) => Promise<void>) {
  const server = createMcpServer(deps)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'test', version: '0.0.1' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  try {
    await run(client)
  } finally {
    await client.close()
    await server.close()
  }
}

type CallToolReturn = Awaited<ReturnType<Client['callTool']>>

function toolJson(result: CallToolReturn): Record<string, unknown> {
  const content: unknown = 'content' in result ? result.content : undefined
  if (!Array.isArray(content)) throw new Error('expected content in tool result')
  const block = content[0] as { type?: string; text?: string } | undefined
  if (block?.type !== 'text' || typeof block.text !== 'string') {
    throw new Error('expected text tool result')
  }
  return JSON.parse(block.text) as Record<string, unknown>
}

function emptyDatabase() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  return db
}

describe('MCP server', () => {
  it('lists the inspection tools and computes severity', async () => {
    await withServer({}, async (client) => {
      const tools = await client.listTools()
      const names = tools.tools.map(t => t.name)
      expect(names).toContain('compute_severity')
      expect(names).toContain('create_work_order')
      expect(names).toContain('search_standards')
      expect(names).toContain('analyze_image')
      expect(names).toContain('get_river_profile')

      const result = await client.callTool({
        name: 'compute_severity',
        arguments: {
          imageCount: 1,
          detections: [{
            id: 'd1', imageId: 'i1', category: 'plastic_bottle', material: null,
            confidence: 0.9, bbox: null, description: '', source: 'vlm', reviewStatus: 'confirmed',
          }],
        },
      })
      expect(JSON.stringify(result.content)).toContain('low')
    })
  })

  it('searches standards against an injected database and embedder', async () => {
    const db = emptyDatabase()
    const embedder: Embedder = { embed: async () => [[1, 0, 0]] }
    await withServer({ db, embedder }, async (client) => {
      const result = await client.callTool({
        name: 'search_standards',
        arguments: { query: '塑料瓶如何处置', categories: ['plastic_bottle'] },
      })
      expect(toolJson(result)).toMatchObject({ clauses: [], noEvidence: true })
    })
  })

  it('analyzes an image through the injected vision port and forwards the hint', async () => {
    let seenHint: string | undefined
    let seenPath: string | undefined
    const vision: VisionPort = {
      analyze: async (input) => {
        seenHint = input.hint
        seenPath = input.imagePath
        return {
          detections: [{
            category: 'fishing_gear', material: null, confidence: 0.88,
            bbox: null, description: 'fake net',
          }],
          abstained: false,
          usage: { inputTokens: 12, outputTokens: 6 },
        }
      },
    }
    await withServer({ vision }, async (client) => {
      const result = await client.callTool({
        name: 'analyze_image',
        arguments: { imagePath: '/tmp/inspection.jpg', hint: '注意渔网' },
      })
      const body = toolJson(result) as { detections: { category: string }[] }
      expect(body.detections[0].category).toBe('fishing_gear')
      expect(seenHint).toBe('注意渔网')
      expect(seenPath).toBe('/tmp/inspection.jpg')
    })
  })

  it('creates a mock work order only for a completed, exportable report', async () => {
    const db = emptyDatabase()
    const run = createRun(db, { instruction: '检查塑料', location: null })
    updateRun(db, run.id, { status: 'completed' })
    saveReport(db, {
      id: 'r1', runId: run.id, version: 1, contentJson: '{}', status: 'draft',
    })

    await withServer({ db }, async (client) => {
      const result = await client.callTool({
        name: 'create_work_order',
        arguments: { runId: run.id, severity: 'medium' },
      })
      expect(toolJson(result)).toEqual({
        ticketId: `MOCK-${run.id.slice(0, 8)}`, severity: 'medium', mock: true,
      })
      expect(listAgentSteps(db, run.id).some(step => step.step === 'create_work_order_mcp')).toBe(true)
    })
  })

  it('refuses a work order while the report awaits review', async () => {
    const db = emptyDatabase()
    const run = createRun(db, { instruction: '检查塑料', location: null })
    updateRun(db, run.id, { status: 'awaiting_review' })
    saveReport(db, {
      id: 'r1', runId: run.id, version: 1, contentJson: '{}', status: 'needs_review',
    })

    await withServer({ db }, async (client) => {
      const result = await client.callTool({
        name: 'create_work_order',
        arguments: { runId: run.id, severity: 'medium' },
      })
      expect(result.isError).toBe(true)
      expect(listAgentSteps(db, run.id)).toHaveLength(0)
    })
  })

  it('returns a mock river profile', async () => {
    await withServer({}, async (client) => {
      const result = await client.callTool({
        name: 'get_river_profile',
        arguments: { riverId: 'river-7' },
      })
      expect(toolJson(result)).toMatchObject({ riverId: 'river-7', mock: true })
    })
  })
})
