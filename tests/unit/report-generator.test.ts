import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { parseReportWithMetrics } from '@/lib/agent/report-generator'
import { RagRetrievalAdapter } from '@/lib/agent/retrieval-adapter'
import { computeSeverityTool, createWorkOrderTool } from '@/lib/agent/tools'
import { createDb } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { ReportDraft } from '@/lib/domain/schemas'
import { PROMPT_VERSIONS } from '@/lib/ai/prompts'
import type { ReportContext } from '@/lib/agent/types'

const context: ReportContext = {
  runId: 'r1', instruction: '检查塑料', location: '某河段',
  inspectedAt: '2026-10-22T00:00:00.000Z',
  detections: [{
    id: 'd1', imageId: 'i1', category: 'plastic_bottle', material: null,
    confidence: 0.9, bbox: null, description: '', source: 'vlm', reviewStatus: 'confirmed',
  }],
  metrics: { imageCount: 1, detectionCount: 1, weightedTotal: 1.2, intensity: 1.2, severity: 'low', formulaVersion: 'severity-v1' },
  clauses: [{ id: 'c1', standardNo: '清川SOP', clauseNo: '第2条', title: '类别', content: '塑料瓶属于塑料类', score: 0.9 }],
}

function rawReport(overrides: Record<string, unknown> = {}) {
  return {
    title: '报告', location: '某河段', inspectedAt: context.inspectedAt,
    claims: [{ id: 'c1', section: 'summary', text: '发现 1 个塑料瓶', evidenceIds: ['detection:d1'] }],
    metrics: { imageCount: 99, detectionCount: 99, weightedTotal: 99, intensity: 99, severity: 'high', formulaVersion: 'fake' },
    citations: [{ standardNo: '清川SOP', clauseNo: '第2条' }],
    modelInfo: { textModel: 'fake-text', visionModel: 'fake-vision', promptVersion: 'fake-prompt' },
    limitations: [],
    ...overrides,
  }
}

describe('parseReportWithMetrics', () => {
  it('overwrites model-supplied metrics with code metrics', () => {
    const report = parseReportWithMetrics(rawReport(), context)
    expect(report.metrics).toEqual(context.metrics)
  })

  it('overwrites model-supplied modelInfo with code values', () => {
    const report = parseReportWithMetrics(rawReport(), context)
    expect(report.modelInfo).toEqual({
      textModel: process.env.TEXT_MODEL ?? 'deepseek-chat',
      visionModel: process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest',
      promptVersion: PROMPT_VERSIONS.reporter,
    })
  })

  it('forces inspectedAt and location from the run context', () => {
    const report = parseReportWithMetrics(
      rawReport({ inspectedAt: '1999-01-01T00:00:00.000Z', location: '模型编造的地点' }),
      context,
    )
    expect(report.inspectedAt).toBe(context.inspectedAt)
    expect(report.location).toBe('某河段')
  })

  it('forces location to null when the run has no location', () => {
    const report = parseReportWithMetrics(
      rawReport({ location: '模型编造的地点' }),
      { ...context, location: null },
    )
    expect(report.location).toBeNull()
  })

  it('still returns a valid ReportDraft from model content', () => {
    const report = parseReportWithMetrics(rawReport(), context)
    expect(() => ReportDraft.parse(report)).not.toThrow()
    expect(report.title).toBe('报告')
    expect(report.claims[0].evidenceIds).toEqual(['detection:d1'])
    expect(report.citations).toEqual([{ standardNo: '清川SOP', clauseNo: '第2条' }])
  })

  it('rejects a report whose claim has no evidence', () => {
    const raw = rawReport({
      claims: [{ id: 'c1', section: 'summary', text: '发现垃圾', evidenceIds: [] }],
    })
    expect(() => parseReportWithMetrics(raw, context)).toThrow()
  })
})

describe('computeSeverityTool', () => {
  it('returns the code-computed severity for valid input', () => {
    const result = computeSeverityTool({ imageCount: 1, detections: [context.detections[0]] })
    expect(result).toEqual({
      perImage: [{ imageId: 'i1', weighted: 1.2 }],
      overall: 'low',
      weightedTotal: 1.2,
      intensity: 1.2,
      formulaVersion: 'severity-v1',
    })
  })

  it('rejects invalid input', () => {
    expect(() => computeSeverityTool({ imageCount: 0, detections: [] })).toThrow()
    expect(() => computeSeverityTool({
      imageCount: 1,
      detections: [{ ...context.detections[0], category: 'not_a_category' }],
    })).toThrow()
    expect(() => computeSeverityTool({ detections: [] })).toThrow()
  })
})

describe('createWorkOrderTool', () => {
  it('returns a mock ticket with the run id prefix', async () => {
    const result = await createWorkOrderTool({ runId: 'abcdef1234567890', severity: 'high' })
    expect(result.mock).toBe(true)
    expect(result.ticketId.startsWith('MOCK-abcdef12-')).toBe(true)
  })
})

describe('RagRetrievalAdapter', () => {
  function dbWithChunks() {
    const db = createDb(':memory:')
    migrate(db, { migrationsFolder: path.resolve('drizzle') })
    db.insert(clauses).values([
      { id: 'c1', documentId: 'd', standardNo: 'SOP', clauseNo: '第2条', title: '类别', content: '塑料瓶属于塑料类', categoryTags: '["plastic_bottle"]', embeddingJson: '[1,0,0]' },
      { id: 'c2', documentId: 'd', standardNo: 'SOP', clauseNo: '第3条', title: '分级', content: '按加权检出量分级', categoryTags: '[]', embeddingJson: '[0,1,0]' },
    ]).run()
    return db
  }

  it('delegates to retrieveClauses and passes categories through', async () => {
    const adapter = new RagRetrievalAdapter(dbWithChunks(), { embed: async () => [[1, 0, 0]] })

    const plastic = await adapter.retrieve('塑料瓶', ['plastic_bottle'])
    expect(plastic.noEvidence).toBe(false)
    expect(plastic.clauses.map(c => c.id)).toEqual(['c1'])

    const metal = await adapter.retrieve('塑料瓶', ['metal'])
    expect(metal.noEvidence).toBe(true)
    expect(metal.clauses).toEqual([])
  })
})
