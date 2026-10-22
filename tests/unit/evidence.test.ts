import { describe, it, expect } from 'vitest'
import { buildEvidenceIndex, verifyReport } from '@/lib/domain/evidence'
import type { Clause, Detection, ReportDraft } from '@/lib/domain/schemas'

const detections: Detection[] = [{
  id: 'd1', imageId: 'i1', category: 'plastic_bottle', material: null,
  confidence: 0.9, bbox: null, description: '', source: 'vlm', reviewStatus: 'confirmed',
}]
const clauses: Clause[] = [{
  id: 'c1', standardNo: '清川SOP', clauseNo: '第3条', title: '严重度', content: '...', score: 0.8,
}]
const metrics: ReportDraft['metrics'] = {
  imageCount: 1, detectionCount: 1, weightedTotal: 1.2, intensity: 1.2,
  severity: 'low', formulaVersion: 'severity-v1',
}

function report(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return {
    title: '报告', location: null, inspectedAt: '2026-10-22T00:00:00.000Z',
    claims: [{ id: 'claim1', section: 'summary', text: '发现 1 个塑料瓶', evidenceIds: ['detection:d1'] }],
    metrics, citations: [{ standardNo: '清川SOP', clauseNo: '第3条' }],
    modelInfo: { textModel: 'deepseek-chat', visionModel: 'qwen2.5-vl-max-latest', promptVersion: 'reporter-v1' },
    limitations: [],
    ...overrides,
  }
}

describe('evidence verifier', () => {
  it('passes a consistent report', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    expect(verifyReport(report(), index).passed).toBe(true)
  })

  it('fails when a claim references unknown evidence', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({
      claims: [{ id: 'claim1', section: 'summary', text: '发现 5 个塑料瓶', evidenceIds: ['detection:missing'] }],
    }), index)
    expect(result.passed).toBe(false)
    expect(result.issues.map(i => i.type)).toContain('unknown_evidence')
  })

  it('fails when report metrics differ from computed metrics', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({ metrics: { ...metrics, detectionCount: 5 } }), index)
    expect(result.issues.map(i => i.type)).toContain('metric_mismatch')
  })

  it('fails when a citation does not exist', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({ citations: [{ standardNo: '不存在', clauseNo: '第9条' }] }), index)
    expect(result.issues.map(i => i.type)).toContain('unknown_citation')
  })

  it('fails when a claim prose count is not an allowed computed count', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({
      claims: [{ id: 'claim1', section: 'summary', text: '发现 5 个塑料瓶', evidenceIds: ['detection:d1'] }],
    }), index)
    expect(result.passed).toBe(false)
    expect(result.issues.map(i => i.type)).toContain('number_mismatch')
  })

  it('passes when claim prose counts are allowed computed counts', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({
      claims: [{ id: 'claim1', section: 'summary', text: '在 1 张图片中发现 1 个塑料瓶', evidenceIds: ['detection:d1'] }],
    }), index)
    expect(result.passed).toBe(true)
  })

  it('does not flag decimals, percentages, dates or numbers without count units', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const result = verifyReport(report({
      claims: [{
        id: 'claim1', section: 'summary',
        text: '置信度 0.9，占比 90%，日期 2026-10-22，编号 42',
        evidenceIds: ['detection:d1'],
      }],
    }), index)
    expect(result.issues.map(i => i.type)).not.toContain('number_mismatch')
  })

  it('fails when a claim has no evidence ids', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const draft = report({
      claims: [{ id: 'claim1', section: 'summary', text: '发现 1 个塑料瓶', evidenceIds: [] }],
    }) as ReportDraft
    const result = verifyReport(draft, index)
    expect(result.passed).toBe(false)
    expect(result.issues.map(i => i.type)).toContain('missing_evidence')
  })

  it('fails when there are no claims', () => {
    const index = buildEvidenceIndex({ detections, clauses, metrics })
    const draft = report({ claims: [] }) as ReportDraft
    const result = verifyReport(draft, index)
    expect(result.passed).toBe(false)
    expect(result.issues.map(i => i.type)).toContain('empty_claims')
  })
})
