import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { regenerateReport, type RegenerateDeps } from '@/lib/agent/regenerate'
import { loadReportDocumentFrom } from '@/lib/server/report-document'
import { BudgetTracker } from '@/lib/ai/budget'
import type { ReportContext } from '@/lib/agent/types'
import type { ReportDraft } from '@/lib/domain/schemas'

const now = () => new Date('2026-10-22T00:00:00.000Z')

function reportFor(context: ReportContext): ReportDraft {
  return {
    title: '报告',
    location: context.location,
    inspectedAt: context.inspectedAt,
    claims: [{ id: 'c1', section: 'summary', text: '本次巡检完成。', evidenceIds: ['metric:overall'] }],
    metrics: context.metrics,
    citations: [],
    modelInfo: { textModel: 'deepseek-chat', visionModel: 'm', promptVersion: 'reporter-v1' },
    limitations: [],
  }
}

const initialReport: ReportDraft = {
  title: '旧报告',
  location: null,
  inspectedAt: '2026-10-22T00:00:00.000Z',
  claims: [{ id: 'c-1', section: 'summary', text: '旧报告。', evidenceIds: ['detection:d1'] }],
  metrics: {
    imageCount: 1,
    detectionCount: 1,
    weightedTotal: 1.2,
    intensity: 1.2,
    severity: 'low',
    formulaVersion: 'severity-v1',
  },
  citations: [],
  modelInfo: { textModel: 'deepseek-chat', visionModel: 'm', promptVersion: 'reporter-v1' },
  limitations: [],
}

function setup(opts: {
  status?: string
  reportStatus?: string
  reviewStatus?: 'pending' | 'confirmed'
  withDetections?: boolean
} = {}) {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  const created = repo.createRun(db, { instruction: '检查塑料', location: null })
  repo.updateRun(db, created.id, { status: opts.status ?? 'awaiting_review', totalCostCny: 0.1 })
  repo.addImage(db, {
    id: 'i1',
    runId: created.id,
    filename: 'a.png',
    path: '/tmp/a.png',
    sha256: 'x',
    status: 'analyzed',
  })
  if (opts.withDetections !== false) {
    repo.addDetections(db, [{
      id: 'd1',
      runId: created.id,
      imageId: 'i1',
      category: 'plastic_bag',
      material: null,
      confidence: 0.42,
      bboxJson: JSON.stringify({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }),
      description: '',
      source: 'vlm',
      reviewStatus: opts.reviewStatus ?? 'pending',
      createdAt: 1,
    }])
  }
  repo.saveReport(db, {
    id: 'report-1',
    runId: created.id,
    version: 1,
    contentJson: JSON.stringify(initialReport),
    status: opts.reportStatus ?? 'needs_review',
  })
  return { db, runId: created.id }
}

function deps(budget = new BudgetTracker(1, 0.1)): RegenerateDeps {
  return {
    retrieval: { retrieve: vi.fn(async () => ({ clauses: [], noEvidence: true })) },
    reporter: {
      draft: vi.fn(async (context: ReportContext) => {
        budget.add(0.05)
        return reportFor(context)
      }),
      repair: vi.fn(async (context: ReportContext) => {
        budget.add(0.05)
        return reportFor(context)
      }),
    },
    verifier: { verify: () => ({ passed: true, issues: [] }) },
    budget,
    dailyBudgetCny: 20,
    now,
  }
}

describe('regenerateReport', () => {
  it('refuses while a low-confidence detection is still pending', async () => {
    const { db, runId } = setup({ reviewStatus: 'pending' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'REVIEW_PENDING', pendingCount: 1 })
    expect(repo.getRun(db, runId)?.status).toBe('awaiting_review')
    expect(repo.getLatestReport(db, runId)?.version).toBe(1)
  })

  it('regenerates a verified draft and opens the export gate after review', async () => {
    const { db, runId } = setup({ reviewStatus: 'pending' })
    repo.updateDetection(db, 'd1', { reviewStatus: 'confirmed' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) throw new Error(outcome.message)
    expect(outcome.runStatus).toBe('completed')

    const run = repo.getRun(db, runId)
    expect(run?.status).toBe('completed')
    // The fake reporter charged 0.05 during draft; that must be persisted and
    // echoed by the response, not overwritten with the pre-draft snapshot.
    expect(run?.totalCostCny).toBeCloseTo(0.15)
    expect(outcome.totalCostCny).toBeCloseTo(0.15)
    const latest = repo.getLatestReport(db, runId)
    expect(latest).toMatchObject({ version: 2, status: 'draft' })

    // Same path the report page uses: the gate is now open and nothing is
    // waiting for review.
    const document = loadReportDocumentFrom(db, runId)
    expect(document?.exportBlocked).toBe(false)
    expect(document?.pendingReviewCount).toBe(0)
    expect(document?.report.title).toBe('报告')
  })

  it('accumulates spend across regeneration calls', async () => {
    const { db, runId } = setup({ reviewStatus: 'pending' })
    repo.updateDetection(db, 'd1', { reviewStatus: 'confirmed' })

    const first = await regenerateReport(db, runId, deps())
    expect(first.ok).toBe(true)
    const afterFirst = repo.getRun(db, runId)?.totalCostCny ?? 0
    expect(afterFirst).toBeCloseTo(0.15)

    // Make the run reviewable again (the real path is a fresh review marking
    // the report stale) and seed the next call from the persisted total.
    repo.updateRun(db, runId, { status: 'awaiting_review' })
    repo.markReportStale(db, runId)

    const second = await regenerateReport(db, runId, deps(new BudgetTracker(1, afterFirst)))
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error(second.message)
    expect(second.totalCostCny).toBeCloseTo(0.2)
    expect(repo.getRun(db, runId)?.totalCostCny).toBeCloseTo(0.2)
  })

  it('returns RUN_BUSY while the run is in flight', async () => {
    const { db, runId } = setup({ status: 'analyzing' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'RUN_BUSY' })
    expect(repo.getRun(db, runId)?.status).toBe('analyzing')
  })

  it('returns ALREADY_COMPLETED for a completed run whose report is current', async () => {
    const { db, runId } = setup({ status: 'completed' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'ALREADY_COMPLETED' })
  })

  it('returns NO_DETECTIONS when there is nothing to report', async () => {
    const { db, runId } = setup({ withDetections: false })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'NO_DETECTIONS' })
  })

  it('retries a failed run that still has detections', async () => {
    const { db, runId } = setup({ status: 'failed', reviewStatus: 'confirmed' })
    repo.updateRun(db, runId, { error: 'prior failure' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome.ok).toBe(true)
    const run = repo.getRun(db, runId)
    expect(run?.status).toBe('completed')
    expect(run?.error).toBeNull()
  })

  it('regenerates a completed run whose report went stale after review', async () => {
    const { db, runId } = setup({ status: 'completed', reportStatus: 'stale', reviewStatus: 'confirmed' })

    const outcome = await regenerateReport(db, runId, deps())

    expect(outcome.ok).toBe(true)
    expect(repo.getRun(db, runId)?.status).toBe('completed')
    expect(repo.getLatestReport(db, runId)).toMatchObject({ version: 2, status: 'draft' })
  })

  it('does not invoke the pre-claim gate for guard-rejected requests', async () => {
    const { db, runId } = setup({ reviewStatus: 'pending' })
    let gateCalls = 0

    const outcome = await regenerateReport(db, runId, {
      ...deps(),
      gate: () => {
        gateCalls++
        return { status: 429, code: 'RATE_LIMITED', message: 'too many' }
      },
    })

    expect(outcome).toMatchObject({ ok: false, code: 'REVIEW_PENDING' })
    expect(gateCalls).toBe(0)
  })

  it('returns the 429 gate error before claiming or drafting', async () => {
    const { db, runId } = setup({ reviewStatus: 'confirmed' })
    const d = deps()

    const outcome = await regenerateReport(db, runId, {
      ...d,
      gate: () => ({ status: 429, code: 'RATE_LIMITED', message: 'too many' }),
    })

    expect(outcome).toMatchObject({ ok: false, status: 429, code: 'RATE_LIMITED' })
    expect(repo.getRun(db, runId)?.status).toBe('awaiting_review')
    expect(repo.getLatestReport(db, runId)?.version).toBe(1)
    expect(vi.mocked(d.reporter.draft)).not.toHaveBeenCalled()
  })

  it.each([
    ['exactly at the cap', 1],
    ['over the cap', 1.5],
  ])('rejects before any paid call when persisted spend is %s', async (_label, totalCostCny) => {
    const { db, runId } = setup({ reviewStatus: 'confirmed' })
    repo.updateRun(db, runId, { totalCostCny })
    // Same seeding the route does: tracker resumes from the persisted total.
    const d = deps(new BudgetTracker(1, repo.getRun(db, runId)!.totalCostCny))
    let gateCalls = 0

    const outcome = await regenerateReport(db, runId, {
      ...d,
      gate: () => {
        gateCalls++
        return null
      },
    })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'BUDGET_EXCEEDED' })
    // No retrieval, no draft/repair, no rate-limit hit, no claim.
    expect(vi.mocked(d.retrieval.retrieve)).not.toHaveBeenCalled()
    expect(vi.mocked(d.reporter.draft)).not.toHaveBeenCalled()
    expect(vi.mocked(d.reporter.repair)).not.toHaveBeenCalled()
    expect(gateCalls).toBe(0)
    expect(repo.getRun(db, runId)?.status).toBe('awaiting_review')
    expect(repo.getLatestReport(db, runId)?.version).toBe(1)
  })

  it('rejects before any paid call when today\'s persisted spend reaches the daily budget', async () => {
    const { db, runId } = setup({ reviewStatus: 'confirmed' })
    repo.updateRun(db, runId, { totalCostCny: 1 })
    // Per-run budget is not the blocker here (spent 1, cap 10).
    const d = deps(new BudgetTracker(10, 1))
    let gateCalls = 0

    const outcome = await regenerateReport(db, runId, {
      ...d,
      dailyBudgetCny: 1,
      // The gate reads the real local day; the fixture timestamps are "now".
      now: () => new Date(),
      gate: () => {
        gateCalls++
        return null
      },
    })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'DAILY_BUDGET_EXCEEDED' })
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('今日 API 预算')
    expect(vi.mocked(d.retrieval.retrieve)).not.toHaveBeenCalled()
    expect(vi.mocked(d.reporter.draft)).not.toHaveBeenCalled()
    expect(vi.mocked(d.reporter.repair)).not.toHaveBeenCalled()
    expect(gateCalls).toBe(0)
    expect(repo.getRun(db, runId)?.status).toBe('awaiting_review')
    expect(repo.getLatestReport(db, runId)?.version).toBe(1)
  })

  it('maps a mid-run budget abort to 409 BUDGET_EXCEEDED and persists spend', async () => {
    const { db, runId } = setup({ reviewStatus: 'confirmed' })
    // Remaining 0.02 passes the pre-call guard; the reporter's 0.05 charge
    // then crosses the cap, which must not surface as a retryable 502.
    const budget = new BudgetTracker(0.12, 0.1)

    const outcome = await regenerateReport(db, runId, deps(budget))

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'BUDGET_EXCEEDED' })
    const run = repo.getRun(db, runId)
    expect(run?.status).toBe('failed')
    expect(run?.totalCostCny).toBeCloseTo(0.15)
    expect(repo.getLatestReport(db, runId)?.version).toBe(1)
  })
})
