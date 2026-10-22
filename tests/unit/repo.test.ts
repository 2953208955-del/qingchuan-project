import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { reports } from '@/lib/db/schema'
import { createRun, getRun, addImage, listImages, updateImage, saveReport, markReportStale, getLatestReport } from '@/lib/db/repo'

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
