import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { createRun, getRun, addImage, listImages, saveReport, markReportStale, getLatestReport } from '@/lib/db/repo'

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

  it('marks an existing report stale', () => {
    const db = freshDb()
    const run = createRun(db, { instruction: 'x', location: null })
    saveReport(db, { id: 'r1', runId: run.id, version: 1, contentJson: '{}', status: 'draft' })
    markReportStale(db, run.id)
    expect(getLatestReport(db, run.id)?.status).toBe('stale')
  })
})
