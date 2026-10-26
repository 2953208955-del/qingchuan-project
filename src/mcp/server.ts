import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { computeSeverity } from '@/lib/domain/severity'
import { DebrisCategory, Detection, Severity } from '@/lib/domain/schemas'
import { retrieveClauses } from '@/lib/rag/retrieve'
import { getDb, type Db } from '@/lib/db/client'
import { addAgentStep, getLatestReport, getRun } from '@/lib/db/repo'
import { DashScopeEmbedder, type Embedder } from '@/lib/rag/embed'
import type { Reranker } from '@/lib/rag/rerank'
import { QwenVisionAnalyzer, type VisionPort } from '@/lib/vision/qwen'
import { getVisionModelId } from '@/lib/ai/providers'
import { createInspectionTools, type InspectionTools } from '@/lib/agent/tool-registry'

export interface McpDeps {
  db?: Db
  embedder?: Embedder
  reranker?: Reranker
  vision?: VisionPort
  tools?: InspectionTools
}

export function createMcpServer(deps: McpDeps = {}) {
  const server = new McpServer({ name: 'qingchuan-inspection', version: '1.0.0' })
  const tools = deps.tools ?? createInspectionTools()

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
    const result = await retrieveClauses(
      { db, embedder, reranker: deps.reranker },
      query,
      categories,
      5,
    )
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('analyze_image', {
    description: '分析一张巡检图片，返回识别结果',
    inputSchema: { imagePath: z.string(), hint: z.string().optional() },
  }, async ({ imagePath, hint }) => {
    const vision = deps.vision ?? new QwenVisionAnalyzer({
      apiKey: process.env.DASHSCOPE_API_KEY ?? '',
      model: getVisionModelId(),
    })
    const result = await vision.analyze({ imagePath, hint })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('create_work_order', {
    description: '创建 mock 整改工单（报告须已完成且可导出）',
    inputSchema: { runId: z.string(), severity: z.enum(Severity.options) },
  }, async ({ runId, severity }) => {
    const db = deps.db ?? getDb()
    const run = getRun(db, runId)
    if (!run) throw new Error('任务不存在')
    if (run.status !== 'completed') {
      throw new Error(`任务状态为 ${run.status}，报告尚未完成，不能创建工单`)
    }
    const report = getLatestReport(db, runId)
    if (!report || report.status !== 'draft') {
      throw new Error('报告尚待人工复核或已过期，不能创建工单')
    }

    const result = await tools.createWorkOrder({ runId, severity })
    const now = Date.now()
    addAgentStep(db, {
      id: crypto.randomUUID(),
      runId,
      step: 'create_work_order_mcp',
      status: 'done',
      toolName: 'createWorkOrder',
      inputJson: JSON.stringify({ severity }),
      outputJson: JSON.stringify(result),
      detail: `工单 ${result.ticketId}（mock）`,
      latencyMs: 0,
      costCny: null,
      error: null,
      startedAt: now,
      finishedAt: now,
    })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  server.registerTool('get_river_profile', {
    description: '返回 mock 河段档案',
    inputSchema: { riverId: z.string() },
  }, async ({ riverId }) => {
    const result = await tools.getRiverProfile({ riverId })
    return { content: [{ type: 'text', text: JSON.stringify(result) }] }
  })

  return server
}
