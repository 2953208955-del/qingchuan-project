import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { finalizeReport } from '@/lib/agent/report-pipeline'
import { BudgetTracker } from '@/lib/ai/budget'
import type { ReportContext, ReporterPort, RetrievalPort, VerifierPort } from '@/lib/agent/types'
import type { Detection, ReportDraft } from '@/lib/domain/schemas'

function setup(focusCategories?: string[]) {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  const created = repo.createRun(db, { instruction: '检查塑料', location: null, focusCategories })
  const run = repo.getRun(db, created.id)
  if (!run) throw new Error('run missing')
  return { db, run }
}

function detection(overrides: Partial<Detection> = {}): Detection {
  return {
    id: 'd1',
    imageId: 'i1',
    category: 'plastic_bottle',
    material: null,
    confidence: 0.42,
    bbox: null,
    description: '',
    source: 'vlm',
    reviewStatus: 'pending',
    ...overrides,
  }
}

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

function reporter(): ReporterPort & { draft: ReturnType<typeof vi.fn>; repair: ReturnType<typeof vi.fn> } {
  return {
    draft: vi.fn(async (context: ReportContext) => reportFor(context)),
    repair: vi.fn(async (context: ReportContext) => reportFor(context)),
  }
}

function retrieval(): RetrievalPort & { retrieve: ReturnType<typeof vi.fn> } {
  return { retrieve: vi.fn(async () => ({ clauses: [], noEvidence: true })) }
}

const passingVerifier: VerifierPort = { verify: () => ({ passed: true, issues: [] }) }

describe('finalizeReport', () => {
  it('completes the run and stores an exportable draft once low-confidence items are resolved', async () => {
    const { db, run } = setup()
    const retrieve = retrieval()
    const generate = reporter()

    const result = await finalizeReport({
      db,
      repo,
      run,
      detections: [detection({ confidence: 0.42, reviewStatus: 'confirmed' })],
      analyzedImageCount: 1,
      retrieval: retrieve,
      reporter: generate,
      verifier: passingVerifier,
      now: () => new Date('2026-10-22T00:00:00.000Z'),
      budget: new BudgetTracker(1),
    })

    expect(result.status).toBe('completed')
    expect(result.verification.passed).toBe(true)
    expect(repo.getRun(db, run.id)?.status).toBe('completed')
    expect(repo.getLatestReport(db, run.id)).toMatchObject({ version: 1, status: 'draft' })
    // No focus categories means retrieval uses the deduped detected categories.
    expect(retrieve.retrieve).toHaveBeenCalledWith('检查塑料', ['plastic_bottle'])
  })

  it('keeps the run awaiting review and the report needs_review while a low-confidence item is pending', async () => {
    const { db, run } = setup()

    const result = await finalizeReport({
      db,
      repo,
      run,
      detections: [detection({ confidence: 0.3, reviewStatus: 'pending' })],
      analyzedImageCount: 1,
      retrieval: retrieval(),
      reporter: reporter(),
      verifier: passingVerifier,
      now: () => new Date('2026-10-22T00:00:00.000Z'),
      budget: new BudgetTracker(1),
    })

    expect(result.status).toBe('awaiting_review')
    expect(repo.getRun(db, run.id)?.status).toBe('awaiting_review')
    expect(repo.getLatestReport(db, run.id)).toMatchObject({ version: 1, status: 'needs_review' })
  })

  it('drops rejected detections from metrics, evidence and the reporter context', async () => {
    const { db, run } = setup()
    const generate = reporter()

    await finalizeReport({
      db,
      repo,
      run,
      detections: [
        detection({ id: 'kept', confidence: 0.9, reviewStatus: 'confirmed' }),
        detection({ id: 'gone', confidence: 0.9, reviewStatus: 'rejected' }),
      ],
      analyzedImageCount: 1,
      retrieval: retrieval(),
      reporter: generate,
      verifier: passingVerifier,
      now: () => new Date('2026-10-22T00:00:00.000Z'),
      budget: new BudgetTracker(1),
    })

    const context = generate.draft.mock.calls[0][0] as ReportContext
    expect(context.detections.map(d => d.id)).toEqual(['kept'])
    expect(context.metrics.detectionCount).toBe(1)
    const row = repo.getLatestReport(db, run.id)
    const stored = JSON.parse(row?.contentJson ?? '{}') as ReportDraft
    expect(stored.metrics.detectionCount).toBe(1)
  })

  it('prefers focus categories over detected categories for retrieval', async () => {
    const { db, run } = setup(['foam'])
    const retrieve = retrieval()

    await finalizeReport({
      db,
      repo,
      run,
      detections: [detection({ confidence: 0.9, reviewStatus: 'confirmed' })],
      analyzedImageCount: 1,
      retrieval: retrieve,
      reporter: reporter(),
      verifier: passingVerifier,
      now: () => new Date('2026-10-22T00:00:00.000Z'),
      budget: new BudgetTracker(1),
    })

    expect(retrieve.retrieve).toHaveBeenCalledWith('检查塑料', ['foam'])
  })

  it('repairs once after a failed verification and trusts the repaired result', async () => {
    const { db, run } = setup()
    const generate = reporter()
    const verify = vi.fn()
      .mockReturnValueOnce({ passed: false, issues: [{ type: 'unknown_evidence', message: 'x' }] })
      .mockReturnValueOnce({ passed: true, issues: [] })

    const result = await finalizeReport({
      db,
      repo,
      run,
      detections: [detection({ confidence: 0.9, reviewStatus: 'confirmed' })],
      analyzedImageCount: 1,
      retrieval: retrieval(),
      reporter: generate,
      verifier: { verify },
      now: () => new Date('2026-10-22T00:00:00.000Z'),
      budget: new BudgetTracker(1),
    })

    expect(generate.repair).toHaveBeenCalledTimes(1)
    expect(verify).toHaveBeenCalledTimes(2)
    expect(result.status).toBe('completed')
  })
})
