import { describe, it, expect } from 'vitest'
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
    retrieval: { retrieve: async () => ({ clauses: [], noEvidence: true }) },
    reporter: { draft: async context => reportFor(context), repair: async context => reportFor(context) },
    verifier: { verify: () => ({ passed: true, issues: [] }) },
    budget,
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
    expect(run?.totalCostCny).toBeCloseTo(0.1)
    const latest = repo.getLatestReport(db, runId)
    expect(latest).toMatchObject({ version: 2, status: 'draft' })

    // Same path the report page uses: the gate is now open and nothing is
    // waiting for review.
    const document = loadReportDocumentFrom(db, runId)
    expect(document?.exportBlocked).toBe(false)
    expect(document?.pendingReviewCount).toBe(0)
    expect(document?.report.title).toBe('报告')
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
})
