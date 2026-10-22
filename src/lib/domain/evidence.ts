import type { Clause, Detection, EvidenceRef, ReportDraft } from './schemas'

export interface EvidenceIndex {
  evidence: Map<string, EvidenceRef>
  metrics: ReportDraft['metrics']
  citations: Set<string>
}

export interface VerifyIssue {
  type: 'missing_evidence' | 'unknown_evidence' | 'metric_mismatch' | 'unknown_citation' | 'empty_claims'
  message: string
  claimId?: string
}

export function buildEvidenceIndex(input: {
  detections: Detection[]
  clauses: Clause[]
  metrics: ReportDraft['metrics']
}): EvidenceIndex {
  const evidence = new Map<string, EvidenceRef>()
  for (const d of input.detections) {
    evidence.set(`detection:${d.id}`, {
      id: `detection:${d.id}`, type: 'detection', refId: d.id,
      label: `${d.category} (${Math.round(d.confidence * 100)}%)`,
    })
  }
  for (const c of input.clauses) {
    evidence.set(`clause:${c.id}`, {
      id: `clause:${c.id}`, type: 'clause', refId: c.id,
      label: `[${c.standardNo} ${c.clauseNo}] ${c.title}`,
    })
  }
  evidence.set('metric:overall', {
    id: 'metric:overall', type: 'metric', refId: 'overall',
    label: `严重度 ${input.metrics.severity} / 强度 ${input.metrics.intensity}`,
  })
  const citations = new Set(input.clauses.map(c => `${c.standardNo}#${c.clauseNo}`))
  return { evidence, metrics: input.metrics, citations }
}

const sameMetrics = (a: ReportDraft['metrics'], b: ReportDraft['metrics']) =>
  a.imageCount === b.imageCount &&
  a.detectionCount === b.detectionCount &&
  Math.abs(a.weightedTotal - b.weightedTotal) < 0.01 &&
  Math.abs(a.intensity - b.intensity) < 0.01 &&
  a.severity === b.severity &&
  a.formulaVersion === b.formulaVersion

export function verifyReport(report: ReportDraft, index: EvidenceIndex): { passed: boolean; issues: VerifyIssue[] } {
  const issues: VerifyIssue[] = []

  if (report.claims.length === 0) {
    issues.push({ type: 'empty_claims', message: '报告没有任何结论' })
  }

  for (const claim of report.claims) {
    if (claim.evidenceIds.length === 0) {
      issues.push({ type: 'missing_evidence', message: '结论未绑定证据', claimId: claim.id })
    }
    for (const id of claim.evidenceIds) {
      if (!index.evidence.has(id)) {
        issues.push({ type: 'unknown_evidence', message: `证据 ${id} 不存在`, claimId: claim.id })
      }
    }
  }

  if (!sameMetrics(report.metrics, index.metrics)) {
    issues.push({ type: 'metric_mismatch', message: '报告数字与代码计算结果不一致' })
  }

  for (const c of report.citations) {
    if (!index.citations.has(`${c.standardNo}#${c.clauseNo}`)) {
      issues.push({ type: 'unknown_citation', message: `引用 ${c.standardNo} ${c.clauseNo} 不在检索结果中` })
    }
  }

  return { passed: issues.length === 0, issues }
}
