import { describe, it, expect } from 'vitest'
import { buildDemoReport } from '@/lib/demo/demo-report'
import { buildEvidenceIndex, verifyReport } from '@/lib/domain/evidence'

describe('demo report provenance', () => {
  it('labels the hand-built seed report as manual, not live AI output', () => {
    const { report } = buildDemoReport()
    expect(report.source).toBe('manual')
    expect(report.limitations.join('\n')).toContain('人工构造')
    expect(report.limitations.join('\n')).toContain('不是实时 AI 输出')
  })

  it('still passes the production verifier and uses the shared metrics', () => {
    const { detections, report } = buildDemoReport()
    const index = buildEvidenceIndex({ detections, clauses: [], metrics: report.metrics })
    expect(verifyReport(report, index).passed).toBe(true)
    expect(report.metrics.detectionCount).toBe(detections.length)
    expect(detections.filter(d => d.reviewStatus === 'pending')).toHaveLength(2)
  })
})
