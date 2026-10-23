import { BudgetExceededError, type BudgetTracker } from '@/lib/ai/budget'
import type { Db } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { pendingLowConfidenceCount } from '@/lib/domain/review'
import { parseDetections } from '@/lib/domain/run-detail'
import { finalizeReport, type FinalReportStatus } from './report-pipeline'
import type { ReporterPort, RetrievalPort, VerifierPort } from './types'

const BUSY_STATUSES = new Set(['analyzing', 'aggregating', 'retrieving', 'drafting', 'verifying'])

export type RegenerateErrorCode =
  | 'NOT_FOUND'
  | 'RUN_BUSY'
  | 'ALREADY_COMPLETED'
  | 'RUN_NOT_REGENERABLE'
  | 'NO_DETECTIONS'
  | 'REVIEW_PENDING'
  | 'RATE_LIMITED'
  | 'REPORT_FAILED'

export interface RegenerateGateError {
  status: number
  code: RegenerateErrorCode
  message: string
}

export type RegenerateOutcome =
  | {
      ok: true
      report: NonNullable<ReturnType<typeof repo.getLatestReport>>
      runStatus: FinalReportStatus
      totalCostCny: number
    }
  | {
      ok: false
      status: number
      code: RegenerateErrorCode
      message: string
      pendingCount?: number
    }

export interface RegenerateDeps {
  retrieval: RetrievalPort
  reporter: ReporterPort
  verifier: VerifierPort
  // Seeded with the run's stored spend so regeneration counts against the
  // same RUN_BUDGET_CNY cap as analysis.
  budget: BudgetTracker
  now?: () => Date
  // Invoked after all cheap DB guards and immediately before the claim/draft
  // (route: rate limiting). Guard-rejected requests must not consume a hit.
  gate?: () => RegenerateGateError | null
}

function fail(
  status: number,
  code: RegenerateErrorCode,
  message: string,
  pendingCount?: number,
): RegenerateOutcome {
  return { ok: false, status, code, message, ...(pendingCount !== undefined ? { pendingCount } : {}) }
}

// Core of POST /api/runs/[id]/report, injectable so unit tests can drive the
// DB guards and the full reviewed-detections pipeline without the HTTP layer.
export async function regenerateReport(
  db: Db,
  runId: string,
  deps: RegenerateDeps,
): Promise<RegenerateOutcome> {
  const run = repo.getRun(db, runId)
  if (!run) return fail(404, 'NOT_FOUND', '任务不存在')
  if (BUSY_STATUSES.has(run.status)) return fail(409, 'RUN_BUSY', '任务仍在分析中，请稍后再试')

  const latestReport = repo.getLatestReport(db, runId)
  const reportStale = latestReport?.status === 'stale'
  // A `failed` run with detections is retryable (REPORT_FAILED is genuinely
  // retryable); a completed run whose report went stale after review is the
  // normal post-review path.
  const eligible = run.status === 'awaiting_review' || run.status === 'failed' || reportStale
  if (!eligible) {
    return run.status === 'completed'
      ? fail(409, 'ALREADY_COMPLETED', '报告已完成，无需重新生成')
      : fail(409, 'RUN_NOT_REGENERABLE', '任务当前状态无法重新生成报告')
  }

  const detections = parseDetections(repo.listDetections(db, runId))
  if (detections.length === 0) return fail(409, 'NO_DETECTIONS', '没有可用的识别结果')

  const pendingCount = pendingLowConfidenceCount(detections)
  if (pendingCount > 0) {
    return fail(409, 'REVIEW_PENDING', `还需复核 ${pendingCount} 项低置信识别结果`, pendingCount)
  }

  // Cheap guards passed; only now may the route spend a rate-limit hit.
  const gateError = deps.gate?.()
  if (gateError) return fail(gateError.status, gateError.code, gateError.message)

  // The check-then-act gate: one concurrent caller wins the UPDATE, everyone
  // else stops before any embedding/reporter call.
  if (repo.claimRunForRegeneration(db, runId) === 0) {
    return fail(409, 'RUN_BUSY', '任务仍在分析中，请稍后再试')
  }

  const images = repo.listImages(db, runId)
  const analyzed = images.filter(image => image.status === 'analyzed').length
  const detectionImageCount = new Set(detections.map(detection => detection.imageId)).size
  // A run that failed before marking images analyzed can still be regenerated
  // from its detections; the metric must never be zero.
  const analyzedImageCount = Math.max(1, analyzed, detectionImageCount)

  try {
    const result = await finalizeReport({
      db,
      repo,
      run,
      detections,
      analyzedImageCount,
      retrieval: deps.retrieval,
      reporter: deps.reporter,
      verifier: deps.verifier,
      now: deps.now ?? (() => new Date()),
      budget: deps.budget,
    })
    const report = repo.getLatestReport(db, runId)
    const updated = repo.getRun(db, runId)
    if (!report) return fail(502, 'REPORT_FAILED', '报告写入失败')
    return {
      ok: true,
      report,
      runStatus: result.status,
      // Read back from the DB so the response and the persisted row agree.
      totalCostCny: updated?.totalCostCny ?? deps.budget.spent,
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const message = error instanceof BudgetExceededError ? `预算超限：${detail}` : detail || '重新生成报告失败'
    repo.updateRun(db, runId, { status: 'failed', error: message, totalCostCny: deps.budget.spent })
    return fail(502, 'REPORT_FAILED', message)
  }
}
