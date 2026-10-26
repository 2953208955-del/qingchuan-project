import { buildEvidenceIndex } from '@/lib/domain/evidence'
import { hasPendingLowConfidence } from '@/lib/domain/review'
import { computeSeverity } from '@/lib/domain/severity'
import { DebrisCategory } from '@/lib/domain/schemas'
import type { Clause, Detection, ReportDraft, RunStatus } from '@/lib/domain/schemas'
import type { Db } from '@/lib/db/client'
import type { RunRow } from '@/lib/db/repo'
import type { BudgetTracker } from '@/lib/ai/budget'
import { PROMPT_VERSIONS } from '@/lib/ai/prompts'
import type { ReporterPort, RetrievalPort, VerifierPort } from './types'

// The report tail shared by a fresh inspection and by "regenerate after review".
// Keeping it in one place guarantees both paths compute the same metrics, use
// the same evidence index and apply the same exportable-run rule.

type ReportRepo = Pick<
  typeof import('@/lib/db/repo'),
  'updateRun' | 'saveReport' | 'getLatestReport' | 'addAgentStep'
>

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

  // Every stage below writes an agent_steps row so the audit trail survives
  // beyond the SSE connection (the stream only carries the per-image steps).
  const addStep = (input: {
    step: string
    status: 'done' | 'error'
    toolName: string | null
    inputJson?: string | null
    outputJson?: string | null
    detail?: string | null
    costCny?: number | null
    error?: string | null
    startedAt: number
  }) => {
    repo.addAgentStep(db, {
      id: crypto.randomUUID(),
      runId: run.id,
      step: input.step,
      status: input.status,
      toolName: input.toolName,
      inputJson: input.inputJson ?? null,
      outputJson: input.outputJson ?? null,
      detail: input.detail ?? null,
      latencyMs: Math.max(0, now().getTime() - input.startedAt),
      costCny: input.costCny ?? null,
      error: input.error ?? null,
      startedAt: input.startedAt,
      finishedAt: now().getTime(),
    })
  }

  const aggregateStart = now().getTime()
  repo.updateRun(db, run.id, { status: 'aggregating' })
  // Rejected findings must never enter metrics, evidence or the reporter
  // prompt, whatever the caller passed in.
  const activeDetections = detections.filter(detection => detection.reviewStatus !== 'rejected')
  const severity = computeSeverity(activeDetections, analyzedImageCount)
  addStep({
    step: 'aggregate',
    status: 'done',
    toolName: 'computeSeverity',
    inputJson: JSON.stringify({ imageCount: analyzedImageCount, detectionCount: activeDetections.length }),
    outputJson: JSON.stringify(severity),
    detail: `识别 ${activeDetections.length} 个目标，严重度 ${severity.overall}`,
    startedAt: aggregateStart,
  })

  const retrieveStart = now().getTime()
  repo.updateRun(db, run.id, { status: 'retrieving' })
  const focusCategories = parseFocusCategories(run.focusCategories)
  // Focus categories are a soft hint. Retrieval still has to cover every
  // category the VLM actually saw, otherwise a plastic-focused instruction
  // could silently drop the fishing-gear clause a human must review.
  const categories = [...new Set([...focusCategories, ...detectedCategories(activeDetections)])]
  let clauses: Clause[]
  try {
    ({ clauses } = await retrieval.retrieve(run.instruction, categories))
  } catch (error) {
    addStep({
      step: 'retrieve',
      status: 'error',
      toolName: 'searchStandards',
      inputJson: JSON.stringify({ categories }),
      error: error instanceof Error ? error.message : String(error),
      startedAt: retrieveStart,
    })
    throw error
  }
  addStep({
    step: 'retrieve',
    status: 'done',
    toolName: 'searchStandards',
    inputJson: JSON.stringify({ categories }),
    outputJson: JSON.stringify({ clauseIds: clauses.map(clause => clause.id) }),
    detail: `${clauses.length} 条候选条款`,
    // Embedding/rerank spend is not tracked (documented residual); no cost is
    // fabricated for this step.
    startedAt: retrieveStart,
  })

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

  repo.updateRun(db, run.id, { status: 'drafting', promptVersion: PROMPT_VERSIONS.reporter })
  const draftStart = now().getTime()
  const beforeDraft = budget.spent
  let report: ReportDraft
  try {
    report = await reporter.draft(context)
  } catch (error) {
    addStep({
      step: 'draft',
      status: 'error',
      toolName: 'draftReport',
      error: error instanceof Error ? error.message : String(error),
      costCny: Math.max(0, budget.spent - beforeDraft),
      startedAt: draftStart,
    })
    throw error
  }
  addStep({
    step: 'draft',
    status: 'done',
    toolName: 'draftReport',
    outputJson: JSON.stringify({ title: report.title, claims: report.claims.length }),
    detail: `${report.claims.length} 条结论`,
    costCny: Math.max(0, budget.spent - beforeDraft),
    startedAt: draftStart,
  })
  const index = buildEvidenceIndex({ detections: activeDetections, clauses, metrics })

  repo.updateRun(db, run.id, { status: 'verifying' })
  let verifyStart = now().getTime()
  let verification = verifier.verify(report, index)
  if (!verification.passed) {
    const repairStart = now().getTime()
    const beforeRepair = budget.spent
    try {
      report = await reporter.repair(context, verification.issues)
    } catch (error) {
      addStep({
        step: 'repair',
        status: 'error',
        toolName: 'draftReport',
        error: error instanceof Error ? error.message : String(error),
        costCny: Math.max(0, budget.spent - beforeRepair),
        startedAt: repairStart,
      })
      throw error
    }
    addStep({
      step: 'repair',
      status: 'done',
      toolName: 'draftReport',
      inputJson: JSON.stringify({ issues: verification.issues }),
      costCny: Math.max(0, budget.spent - beforeRepair),
      detail: `根据 ${verification.issues.length} 个校验问题回修`,
      startedAt: repairStart,
    })
    verifyStart = now().getTime()
    verification = verifier.verify(report, index)
  }
  // Verification issues are part of the audit record, not just a transient
  // return value; the step fails when the final verification still fails.
  addStep({
    step: 'verify',
    status: verification.passed ? 'done' : 'error',
    toolName: 'verifyReport',
    outputJson: JSON.stringify(verification),
    detail: verification.passed ? '校验通过' : `${verification.issues.length} 个校验问题`,
    error: verification.passed ? null : verification.issues.map(issue => issue.message).join('; '),
    startedAt: verifyStart,
  })

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
