import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { reports, runs } from '@/lib/db/schema'
import {
  createRun,
  getRun,
  addImage,
  listImages,
  updateImage,
  saveReport,
  markReportStale,
  getLatestReport,
  claimRunForAnalysis,
  claimRunForRegeneration,
  sumRunCostCnyBetween,
  updateRun,
} from '@/lib/db/repo'
import { localDayBounds } from '@/lib/ai/budget'

function freshDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  return db
}

describe('repository', () => {
  it('creates and reads a run', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: '检查塑料垃圾', location: '某河段' })
    expect(getRun(db, run.id)?.instruction).toBe('检查塑料垃圾')
  })

  it('stores images for a run', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })
    addImage(db, { id: 'i1', runId: run.id, filename: 'a.png', path: '/tmp/a.png', sha256: 'abc', status: 'pending' })
    expect(listImages(db, run.id)).toHaveLength(1)
  })

  it('persists image dimensions and exif metadata through addImage and updateImage', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })
    addImage(db, {
      id: 'i1', runId: run.id, filename: 'a.png', path: '/tmp/a.png', sha256: 'abc',
      status: 'pending', width: 1920, height: 1080, exifJson: '{"make":"Canon"}',
    })
    updateImage(db, 'i1', { width: 800, height: 600, exifJson: '{"make":"Nikon"}', status: 'analyzed' })
    const image = listImages(db, run.id)[0]
    expect(image).toMatchObject({
      width: 800, height: 600, exifJson: '{"make":"Nikon"}', status: 'analyzed',
    })
  })

  it('claims an idle/planned run for analysis exactly once', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })

    expect(claimRunForAnalysis(db, run.id)).toBe(1)
    expect(getRun(db, run.id)?.status).toBe('analyzing')
    // The second concurrent request loses the conditional UPDATE.
    expect(claimRunForAnalysis(db, run.id)).toBe(0)

    // Regeneration has its own claim; a run already in flight cannot start.
    expect(claimRunForRegeneration(db, run.id)).toBe(0)
  })

  it('does not claim a run that is no longer startable', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })
    updateRun(db, run.id, { status: 'completed' })
    expect(claimRunForAnalysis(db, run.id)).toBe(0)
  })

  it('sums only the local day and treats missing/zero cost as zero', () => {
    const db = freshDb()
    const now = new Date(2026, 9, 24, 12, 0, 0)
    const { start, end } = localDayBounds(now)

    const today = createRun(db, { instruction: 'today', location: null })
    updateRun(db, today.id, { totalCostCny: 0.4 })
    db.update(runs).set({ createdAt: now.getTime() - 60_000 }).where(eq(runs.id, today.id)).run()

    const zero = createRun(db, { instruction: 'zero', location: null })
    db.update(runs).set({ createdAt: now.getTime() - 30_000 }).where(eq(runs.id, zero.id)).run()

    const yesterday = createRun(db, { instruction: 'yesterday', location: null })
    updateRun(db, yesterday.id, { totalCostCny: 9.9 })
    db.update(runs).set({ createdAt: now.getTime() - 24 * 60 * 60 * 1000 }).where(eq(runs.id, yesterday.id)).run()

    expect(sumRunCostCnyBetween(db, start, end)).toBeCloseTo(0.4)
    // Empty windows are 0, never null/NaN.
    expect(sumRunCostCnyBetween(db, 0, 1)).toBe(0)
  })

  it('marks all reports for a run stale', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })
    saveReport(db, { id: 'r1', runId: run.id, version: 1, contentJson: '{"v":1}', status: 'draft' })
    saveReport(db, { id: 'r2', runId: run.id, version: 2, contentJson: '{"v":2}', status: 'draft' })
    markReportStale(db, run.id)
    const rows = db.select().from(reports).where(eq(reports.runId, run.id)).all()
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.status)).toEqual(['stale', 'stale'])
    expect(getLatestReport(db, run.id)?.status).toBe('stale')
  })
})
