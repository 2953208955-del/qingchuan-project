import { describe, it, expect } from 'vitest'
import { Detection, ReportClaim, ReportDraft } from '@/lib/domain/schemas'

describe('domain schemas', () => {
  it('accepts a valid detection', () => {
    const d = Detection.parse({
      id: 'd1', imageId: 'i1', category: 'plastic_bottle', material: 'PET',
      confidence: 0.92, bbox: { x: 0.1, y: 0.2, w: 0.2, h: 0.3 },
      description: '透明塑料瓶', source: 'vlm',
    })
    expect(d.reviewStatus).toBe('pending')
  })

  it('rejects a bbox outside the image', () => {
    expect(() => Detection.parse({
      id: 'd1', imageId: 'i1', category: 'plastic_bag', material: null,
      confidence: 0.5, bbox: { x: 0.9, y: 0.9, w: 0.2, h: 0.2 },
      description: '塑料袋', source: 'vlm',
    })).toThrow()
  })

  it('requires every claim to carry evidence', () => {
    expect(() => ReportClaim.parse({ id: 'c1', section: 'summary', text: '发现塑料瓶', evidenceIds: [] })).toThrow()
  })

  it('parses a complete report', () => {
    const report = ReportDraft.parse({
      title: '巡检报告', location: '某河段', inspectedAt: '2026-10-22T08:00:00.000Z',
      claims: [{ id: 'c1', section: 'summary', text: '发现 3 个塑料瓶', evidenceIds: ['e1'] }],
      metrics: { imageCount: 1, detectionCount: 3, weightedTotal: 3.6, intensity: 3.6, severity: 'medium', formulaVersion: 'severity-v1' },
      citations: [{ standardNo: '清川SOP', clauseNo: '第2条' }],
      modelInfo: { textModel: 'deepseek-chat', visionModel: 'qwen3-vl-plus', promptVersion: 'reporter-v1' },
      limitations: ['未做面积标定'],
    })
    expect(report.metrics.severity).toBe('medium')
  })
})
