import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb, type Db } from '@/lib/db/client'
import { clauses, detections, images, reports, runs } from '@/lib/db/schema'
import { loadDashboardOverview } from '@/lib/dashboard/overview'
import { buildMapPoints } from '@/lib/dashboard/map-points'

const NOW = 1_760_000_000_000

function freshDb(): Db {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  return db
}

function insertRun(db: Db, id: string, createdAt: number, status = 'completed') {
  db.insert(runs).values({
    id,
    status,
    instruction: `检查 ${id}`,
    location: '示例河段',
    focusCategories: '[]',
    totalCostCny: 0,
    createdAt,
    updatedAt: createdAt,
  }).run()
}

function insertImage(
  db: Db,
  id: string,
  runId: string,
  status: 'pending' | 'analyzed' | 'failed',
) {
  db.insert(images).values({
    id,
    runId,
    filename: `${id}.jpg`,
    path: `/tmp/${id}.jpg`,
    sha256: `sha-${id}`,
    status,
  }).run()
}

function insertDetection(
  db: Db,
  input: {
    id: string
    runId: string
    imageId: string
    category: string
    confidence: number
    reviewStatus: string
    createdAt: number
  },
) {
  db.insert(detections).values({
    ...input,
    material: null,
    bboxJson: null,
    description: `目标 ${input.id}`,
    source: 'vlm',
  }).run()
}

function validReport(source?: 'ai' | 'manual') {
  return {
    title: `巡检报告 ${source ?? '旧版'}`,
    location: null,
    inspectedAt: '2026-10-25T00:00:00.000Z',
    ...(source ? { source } : {}),
    claims: [{
      id: 'claim-1',
      section: 'summary',
      text: '发现漂浮物。',
      evidenceIds: ['detection-1'],
    }],
    metrics: {
      imageCount: 1,
      detectionCount: 1,
      weightedTotal: 1,
      intensity: 1,
      severity: 'low',
      formulaVersion: 'v1',
    },
    citations: [],
    modelInfo: { textModel: 'text', visionModel: 'vision', promptVersion: 'v1' },
    limitations: [],
  }
}

function insertReport(
  db: Db,
  input: { id: string; runId: string; version: number; content: unknown; createdAt: number },
) {
  db.insert(reports).values({
    id: input.id,
    runId: input.runId,
    version: input.version,
    contentJson: typeof input.content === 'string'
      ? input.content
      : JSON.stringify(input.content),
    status: 'draft',
    createdAt: input.createdAt,
  }).run()
}

function seedReportedRun(db: Db, latestSource?: 'ai' | 'manual') {
  insertRun(db, 'run-reported', NOW)
  insertImage(db, 'img-reported', 'run-reported', 'analyzed')
  insertDetection(db, {
    id: 'det-reported',
    runId: 'run-reported',
    imageId: 'img-reported',
    category: 'plastic_bottle',
    confidence: 0.9,
    reviewStatus: 'confirmed',
    createdAt: NOW,
  })

  if (!latestSource) {
    insertReport(db, {
      id: 'report-legacy',
      runId: 'run-reported',
      version: 1,
      content: validReport(),
      createdAt: NOW,
    })
    return
  }

  const olderSource = latestSource === 'manual' ? 'ai' : 'manual'
  insertReport(db, {
    id: 'report-v1',
    runId: 'run-reported',
    version: 1,
    content: validReport(olderSource),
    // The newer createdAt must not outrank the higher version.
    createdAt: NOW + 1_000,
  })
  insertReport(db, {
    id: 'report-v2',
    runId: 'run-reported',
    version: 2,
    content: validReport(latestSource),
    createdAt: NOW,
  })
}

describe('loadDashboardOverview', () => {
  it('chooses the latest run that has an analyzed image and non-rejected detections', () => {
    const db = freshDb()
    // Deliberately insert the older run first: a missing ORDER BY must not win.
    insertRun(db, 'run-older', NOW - 200)
    insertImage(db, 'img-older', 'run-older', 'analyzed')
    insertDetection(db, {
      id: 'det-older', runId: 'run-older', imageId: 'img-older',
      category: 'plastic_bottle', confidence: 0.8, reviewStatus: 'confirmed', createdAt: NOW - 200,
    })

    insertRun(db, 'run-latest', NOW)
    insertImage(db, 'img-latest-analyzed', 'run-latest', 'analyzed')
    insertImage(db, 'img-latest-pending', 'run-latest', 'pending')
    insertDetection(db, {
      id: 'det-latest-ok', runId: 'run-latest', imageId: 'img-latest-analyzed',
      category: 'natural', confidence: 0.9, reviewStatus: 'confirmed', createdAt: NOW + 1,
    })
    insertDetection(db, {
      id: 'det-latest-rejected', runId: 'run-latest', imageId: 'img-latest-analyzed',
      category: 'metal', confidence: 0.7, reviewStatus: 'rejected', createdAt: NOW + 2,
    })

    // Newest run is unusable: no analyzed image.
    insertRun(db, 'run-newest', NOW + 100)
    insertImage(db, 'img-newest-pending', 'run-newest', 'pending')
    insertDetection(db, {
      id: 'det-newest', runId: 'run-newest', imageId: 'img-newest-pending',
      category: 'plastic_bag', confidence: 0.6, reviewStatus: 'confirmed', createdAt: NOW + 100,
    })

    const overview = loadDashboardOverview(db)

    expect(overview.heroRun?.id).toBe('run-latest')
    expect(overview.heroRun?.images.map(image => image.id)).toEqual(['img-latest-analyzed'])
    expect(overview.heroRun?.detections.map(detection => detection.id)).toEqual(['det-latest-ok'])
    expect(overview.heroRun?.detections[0].createdAt).toBe(NOW + 1)
    expect(overview.heroRun?.hasReport).toBe(false)
    expect(overview.heroRun?.isDemo).toBe(false)

    const expectedMap = buildMapPoints(overview.heroRun?.detections ?? [])
    expect(overview.mapPoints).toEqual(expectedMap.points)
    expect(overview.hiddenMapPointCount).toBe(expectedMap.hiddenCount)
  })

  it('ignores a newer run whose detections are all rejected', () => {
    const db = freshDb()
    insertRun(db, 'run-qualified', NOW - 100)
    insertImage(db, 'img-qualified', 'run-qualified', 'analyzed')
    insertDetection(db, {
      id: 'det-qualified', runId: 'run-qualified', imageId: 'img-qualified',
      category: 'glass', confidence: 0.8, reviewStatus: 'confirmed', createdAt: NOW - 100,
    })

    insertRun(db, 'run-all-rejected', NOW)
    insertImage(db, 'img-rejected', 'run-all-rejected', 'analyzed')
    insertDetection(db, {
      id: 'det-rejected-1', runId: 'run-all-rejected', imageId: 'img-rejected',
      category: 'plastic_bottle', confidence: 0.95, reviewStatus: 'rejected', createdAt: NOW,
    })
    insertDetection(db, {
      id: 'det-rejected-2', runId: 'run-all-rejected', imageId: 'img-rejected',
      category: 'foam', confidence: 0.2, reviewStatus: 'rejected', createdAt: NOW + 1,
    })

    const overview = loadDashboardOverview(db)

    expect(overview.heroRun?.id).toBe('run-qualified')
    expect(overview.heroRun?.detections.map(detection => detection.id)).toEqual(['det-qualified'])
    expect(overview.stats.totalDetections).toBe(1)
    expect(overview.stats.pendingLowConfidence).toBe(0)
  })

  it('aggregates non-rejected detections and counts only pending low-confidence rows', () => {
    const db = freshDb()
    insertRun(db, 'run-stats', NOW)
    insertImage(db, 'img-stats', 'run-stats', 'analyzed')
    insertDetection(db, {
      id: 'det-pending-low', runId: 'run-stats', imageId: 'img-stats',
      category: 'plastic_bottle', confidence: 0.42, reviewStatus: 'pending', createdAt: NOW + 1,
    })
    insertDetection(db, {
      id: 'det-natural', runId: 'run-stats', imageId: 'img-stats',
      category: 'natural', confidence: 0.8, reviewStatus: 'confirmed', createdAt: NOW + 2,
    })
    insertDetection(db, {
      id: 'det-rejected', runId: 'run-stats', imageId: 'img-stats',
      category: 'metal', confidence: 0.99, reviewStatus: 'rejected', createdAt: NOW + 3,
    })
    insertDetection(db, {
      id: 'det-corrected', runId: 'run-stats', imageId: 'img-stats',
      category: 'foam', confidence: 0.6, reviewStatus: 'corrected', createdAt: NOW + 4,
    })
    // Malformed rows are dropped by parseDetections instead of poisoning stats.
    insertDetection(db, {
      id: 'det-corrupt', runId: 'run-stats', imageId: 'img-stats',
      category: 'not-a-category', confidence: 0.9, reviewStatus: 'confirmed', createdAt: NOW + 5,
    })

    insertRun(db, 'run-stats-older', NOW - 200)
    insertImage(db, 'img-stats-older', 'run-stats-older', 'analyzed')
    insertDetection(db, {
      id: 'det-pending-edge', runId: 'run-stats-older', imageId: 'img-stats-older',
      category: 'glass', confidence: 0.5, reviewStatus: 'pending', createdAt: NOW - 190,
    })
    insertDetection(db, {
      id: 'det-low-confirmed', runId: 'run-stats-older', imageId: 'img-stats-older',
      category: 'paper', confidence: 0.224, reviewStatus: 'confirmed', createdAt: NOW - 180,
    })
    insertDetection(db, {
      id: 'det-old-rejected', runId: 'run-stats-older', imageId: 'img-stats-older',
      category: 'textile', confidence: 0.7, reviewStatus: 'rejected', createdAt: NOW - 170,
    })

    insertReport(db, {
      id: 'report-run-stats-v1', runId: 'run-stats', version: 1,
      content: validReport('ai'), createdAt: NOW + 500,
    })
    insertReport(db, {
      id: 'report-run-stats-v2', runId: 'run-stats', version: 2,
      content: validReport('manual'), createdAt: NOW,
    })
    insertReport(db, {
      id: 'report-run-stats-older-v1', runId: 'run-stats-older', version: 1,
      content: validReport('ai'), createdAt: NOW - 100,
    })

    db.insert(clauses).values([
      {
        id: 'clause-1', documentId: 'doc-1', standardNo: 'SB/T 1', clauseNo: '1.1',
        title: '条款一', content: '内容一', categoryTags: '[]', embeddingJson: '[]',
      },
      {
        id: 'clause-2', documentId: 'doc-1', standardNo: 'SB/T 1', clauseNo: '1.2',
        title: '条款二', content: '内容二', categoryTags: '[]', embeddingJson: '[]',
      },
    ]).run()

    const overview = loadDashboardOverview(db)
    const categoryCounts = Object.fromEntries(
      overview.stats.categoryMix.map(item => [item.category, item.count]),
    )

    expect(overview.stats.totalRuns).toBe(2)
    expect(overview.stats.totalDetections).toBe(5)
    expect(overview.stats.pendingLowConfidence).toBe(1)
    expect(overview.stats.averageConfidence).toBe(0.509)
    expect(categoryCounts).toEqual({
      plastic_bottle: 1,
      natural: 1,
      foam: 1,
      glass: 1,
      paper: 1,
    })
    expect(overview.stats.confidenceBins.map(bin => bin.count)).toEqual([0, 1, 2, 1, 1])
    expect(overview.stats.reportCount).toBe(2)
    expect(overview.stats.clauseCount).toBe(2)
  })

  it('marks a run as demo only when its latest report parses and source is manual', () => {
    const manualDb = freshDb()
    seedReportedRun(manualDb, 'manual')
    const manualOverview = loadDashboardOverview(manualDb)
    expect(manualOverview.heroRun?.hasReport).toBe(true)
    expect(manualOverview.heroRun?.isDemo).toBe(true)

    const aiDb = freshDb()
    seedReportedRun(aiDb, 'ai')
    const aiOverview = loadDashboardOverview(aiDb)
    expect(aiOverview.heroRun?.hasReport).toBe(true)
    expect(aiOverview.heroRun?.isDemo).toBe(false)

    // Reports written before provenance existed still link, but are not demos.
    const legacyDb = freshDb()
    seedReportedRun(legacyDb)
    const legacyOverview = loadDashboardOverview(legacyDb)
    expect(legacyOverview.heroRun?.hasReport).toBe(true)
    expect(legacyOverview.heroRun?.isDemo).toBe(false)
  })

  it('does not expose a report link for a corrupt report', () => {
    const db = freshDb()
    seedReportedRun(db, 'manual')
    insertReport(db, {
      id: 'report-corrupt',
      runId: 'run-reported',
      version: 3,
      content: '{not valid json',
      createdAt: NOW + 2_000,
    })

    const overview = loadDashboardOverview(db)

    expect(overview.heroRun?.hasReport).toBe(false)
    expect(overview.heroRun?.isDemo).toBe(false)
  })

  it('does not expose a report link when the latest report is not a valid draft', () => {
    const db = freshDb()
    seedReportedRun(db, 'manual')
    insertReport(db, {
      id: 'report-invalid-draft',
      runId: 'run-reported',
      version: 3,
      content: { title: '缺少必填字段' },
      createdAt: NOW + 2_000,
    })

    const overview = loadDashboardOverview(db)

    expect(overview.heroRun?.hasReport).toBe(false)
    expect(overview.heroRun?.isDemo).toBe(false)
  })

  it('returns a safe empty overview for an empty database', () => {
    const overview = loadDashboardOverview(freshDb())

    expect(overview.heroRun).toBeNull()
    expect(overview.mapPoints).toEqual([])
    expect(overview.hiddenMapPointCount).toBe(0)
    expect(overview.stats).toMatchObject({
      totalRuns: 0,
      totalDetections: 0,
      pendingLowConfidence: 0,
      averageConfidence: 0,
      reportCount: 0,
      clauseCount: 0,
      categoryMix: [],
    })
    expect(overview.stats.confidenceBins).toHaveLength(5)
    expect(overview.stats.confidenceBins.map(bin => bin.count)).toEqual([0, 0, 0, 0, 0])
  })
})
