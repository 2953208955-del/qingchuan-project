import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { computeSeverity } from '@/lib/domain/severity'
import { DebrisCategory, Detection } from '@/lib/domain/schemas'
import { retrieveClauses } from '@/lib/rag/retrieve'
import { getDb, type Db } from '@/lib/db/client'
import { DashScopeEmbedder, type Embedder } from '@/lib/rag/embed'
import { QwenVisionAnalyzer, type VisionPort } from '@/lib/vision/qwen'

export interface McpDeps {
  db?: Db
  embedder?: Embedder
  vision?: VisionPort
}

export function createMcpServer(deps: McpDeps = {}) {
  const server = new McpServer({ name: 'qingchuan-inspection', version: '1.0.0' })

  server.registerTool('compute_severity', {
    description: '根据识别结果计算严重度（纯代码）',
    inputSchema: { detections: z.array(Detection), imageCount: z.number().int().positive() },
  }, async ({ detections, imageCount }) => ({
    content: [{ type: 'text', text: JSON.stringify(computeSeverity(detections, imageCount)) }],
  }))

  server.registerTool('search_standards', {
    description: '检索巡检标准条款',
    inputSchema: { query: z.string(), categories: z.array(DebrisCategory).default([]) },
  }, async ({ query, categories }) => {
    const db = deps.db ?? getDb()
    const embedder = deps.embedder ?? new DashScopeEmbedder(process.env.DASHSCOPE_API_KEY ?? '')
    const result = await retrieveClauses({ db, embedder }, query, categories, 5)
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('analyze_image', {
    description: '分析一张巡检图片，返回识别结果',
    inputSchema: { imagePath: z.string(), hint: z.string().optional() },
  }, async ({ imagePath, hint }) => {
    const vision = deps.vision ?? new QwenVisionAnalyzer({
      apiKey: process.env.DASHSCOPE_API_KEY ?? '',
      model: process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest',
    })
    const result = await vision.analyze({ imagePath, hint })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('create_work_order', {
    description: '创建 mock 整改工单',
    inputSchema: { runId: z.string(), severity: z.enum(['low', 'medium', 'high']) },
  }, async ({ runId, severity }) => ({
    content: [{ type: 'text', text: JSON.stringify({ ticketId: `MOCK-${runId.slice(0, 8)}`, severity, mock: true }) }],
  }))

  server.registerTool('get_river_profile', {
    description: '返回 mock 河段档案',
    inputSchema: { riverId: z.string() },
  }, async ({ riverId }) => ({
    content: [{ type: 'text', text: JSON.stringify({ riverId, name: '示例河段', lengthKm: 3.2, mock: true }) }],
  }))

  return server
}
