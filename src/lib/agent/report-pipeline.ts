import { buildEvidenceIndex } from '@/lib/domain/evidence'
import { hasPendingLowConfidence } from '@/lib/domain/review'
import { computeSeverity } from '@/lib/domain/severity'
import { DebrisCategory } from '@/lib/domain/schemas'
import type { Detection, ReportDraft, RunStatus } from '@/lib/domain/schemas'
import type { Db } from '@/lib/db/client'
import type { RunRow } from '@/lib/db/repo'
import type { BudgetTracker } from '@/lib/ai/budget'
import type { ReporterPort, RetrievalPort, VerifierPort } from './types'

// The report tail shared by a fresh inspection and by "regenerate after review".
// Keeping it in one place guarantees both paths compute the same metrics, use
// the same evidence index and apply the same exportable-run rule.

type ReportRepo = Pick<typeof import('@/lib/db/repo'), 'updateRun' | 'saveReport' | 'getLatestReport'>

const CATEGORY_VALUES = new Set<string>(DebrisCategory.options)

// run.focusCategories is user-supplied JSON; anything malformed or outside the
// known categories is ignored rather than allowed to break the run.
export function parseFocusCategories(raw: string | null | undefined): DebrisCategory[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is DebrisCategory => typeof value === 'string' && CATEGORY_VALUES.has(value))
  } catch {
    return []
  }
}

function detectedCategories(detections: Detection[]): DebrisCategory[] {
  return [...new Set(detections.map(d => d.category))]
}

export type FinalReportStatus = Extract<RunStatus, 'completed' | 'awaiting_review'>

export interface FinalizeReportInput {
  db: Db
  repo: ReportRepo
  run: RunRow
  detections: Detection[]
  analyzedImageCount: number
  retrieval: RetrievalPort
  reporter: ReporterPort
  verifier: VerifierPort
  now: () => Date
  // Read AFTER drafting/repair, so the reporter's charges are persisted too.
  // The tracker is seeded by the caller (0 for a fresh run, the stored total
  // for regeneration).
  budget: BudgetTracker
}

export interface FinalizeReportResult {
  report: ReportDraft
  verification: ReturnType<VerifierPort['verify']>
  status: FinalReportStatus
}

export async function finalizeReport(input: FinalizeReportInput): Promise<FinalizeReportResult> {
  const { db, repo, run, detections, analyzedImageCount, retrieval, reporter, verifier, now, budget } = input
  if (!Number.isInteger(analyzedImageCount) || analyzedImageCount <= 0) {
    throw new Error('analyzedImageCount must be a positive integer')
  }

  repo.updateRun(db, run.id, { status: 'aggregating' })
  // Rejected findings must never enter metrics, evidence or the reporter
  // prompt, whatever the caller passed in.
  const activeDetections = detections.filter(detection => detection.reviewStatus !== 'rejected')
  const severity = computeSeverity(activeDetections, analyzedImageCount)

  repo.updateRun(db, run.id, { status: 'retrieving' })
  const focusCategories = parseFocusCategories(run.focusCategories)
  const categories = focusCategories.length > 0 ? focusCategories : detectedCategories(activeDetections)
  const { clauses } = await retrieval.retrieve(run.instruction, categories)

  const metrics: ReportDraft['metrics'] = {
    imageCount: analyzedImageCount,
    detectionCount: activeDetections.length,
    weightedTotal: severity.weightedTotal,
    intensity: severity.intensity,
    severity: severity.overall,
    formulaVersion: severity.formulaVersion,
  }
  const context = {
    runId: run.id,
    instruction: run.instruction,
    location: run.location,
    inspectedAt: now().toISOString(),
    detections: activeDetections,
    metrics,
    clauses,
  }

  repo.updateRun(db, run.id, { status: 'drafting' })
  let report = await reporter.draft(context)
  const index = buildEvidenceIndex({ detections: activeDetections, clauses, metrics })

  repo.updateRun(db, run.id, { status: 'verifying' })
  let verification = verifier.verify(report, index)
  if (!verification.passed) {
    report = await reporter.repair(context, verification.issues)
    verification = verifier.verify(report, index)
  }

  // A report is exportable only when the verifier accepts it and no
  // low-confidence finding is still waiting for a human decision.
  const exportable = verification.passed && !hasPendingLowConfidence(activeDetections)
  const status: FinalReportStatus = exportable ? 'completed' : 'awaiting_review'

  repo.saveReport(db, {
    id: crypto.randomUUID(),
    runId: run.id,
    version: (repo.getLatestReport(db, run.id)?.version ?? 0) + 1,
    contentJson: JSON.stringify(report),
    status: exportable ? 'draft' : 'needs_review',
  })

  // budget.spent now includes the reporter's draft/repair charges; snapshotting
  // it earlier (before drafting) would persist a stale total.
  repo.updateRun(db, run.id, {
    status,
    error: null,
    totalCostCny: budget.spent,
  })

  return { report, verification, status }
}
