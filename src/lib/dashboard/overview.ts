import { desc } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { getDb } from '@/lib/db/client'
import { clauses, detections, images, reports, runs } from '@/lib/db/schema'
import { ReportDraft, RunStatus } from '@/lib/domain/schemas'
import { isPendingLowConfidence } from '@/lib/domain/review'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'
import { buildCategoryMix, buildConfidenceBins } from './chart-data'
import { buildMapPoints } from './map-points'
import type { DashboardDetection, DashboardOverview, DashboardRun } from './types'

type DetectionRow = typeof detections.$inferSelect
type ReportRow = typeof reports.$inferSelect

function groupByRunId<T extends { runId: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    const group = grouped.get(row.runId)
    if (group) group.push(row)
    else grouped.set(row.runId, [row])
  }
  return grouped
}

function toDashboardDetections(rows: DetectionRow[]): DashboardDetection[] {
  const createdAtById = new Map(rows.map(row => [row.id, row.createdAt]))
  return parseDetections(rows).map(detection => ({
    ...detection,
    // parseDetections strips the storage-only runId/createdAt columns.
    createdAt: createdAtById.get(detection.id) ?? 0,
  }))
}

function parseReport(row: ReportRow): ReportDraft | null {
  try {
    const parsed = ReportDraft.safeParse(JSON.parse(row.contentJson))
    return parsed.success ? parsed.data : null
  } catch {
    // A partial write or older schema must not crash the dashboard or link to
    // a report page that will 404.
    return null
  }
}

function parseRunStatus(value: string): DashboardRun['status'] {
  const parsed = RunStatus.safeParse(value)
  return parsed.success ? parsed.data : 'idle'
}

export function loadDashboardOverview(db: Db = getDb()): DashboardOverview {
  const runRows = db.select().from(runs)
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .all()
  const imageRows = db.select().from(images)
    .orderBy(images.id)
    .all()
  const detectionRows = db.select().from(detections)
    .orderBy(detections.createdAt, detections.id)
    .all()
  const reportRows = db.select().from(reports)
    .orderBy(desc(reports.version), desc(reports.createdAt), desc(reports.id))
    .all()
  const clauseRows = db.select({ id: clauses.id }).from(clauses).all()

  const imagesByRun = groupByRunId(imageRows)
  const detectionsByRun = groupByRunId(detectionRows)

  const runData = runRows.map(run => {
    const parsedImages = parseImages(imagesByRun.get(run.id) ?? [])
    const activeDetections = toDashboardDetections(detectionsByRun.get(run.id) ?? [])
      .filter(detection => detection.reviewStatus !== 'rejected')
    return { run, parsedImages, activeDetections }
  })

  // Rows arrive version-descending, so the first report per run is its latest.
  const latestReportByRun = new Map<string, ReportDraft | null>()
  for (const row of reportRows) {
    if (!latestReportByRun.has(row.runId)) {
      latestReportByRun.set(row.runId, parseReport(row))
    }
  }

  const heroData = runData.find(({ parsedImages, activeDetections }) =>
    parsedImages.some(image => image.status === 'analyzed') &&
    activeDetections.length > 0,
  )

  let heroRun: DashboardRun | null = null
  if (heroData) {
    const report = latestReportByRun.get(heroData.run.id) ?? null
    heroRun = {
      id: heroData.run.id,
      instruction: heroData.run.instruction,
      location: heroData.run.location,
      status: parseRunStatus(heroData.run.status),
      createdAt: heroData.run.createdAt,
      isDemo: report?.source === 'manual',
      hasReport: report !== null,
      images: heroData.parsedImages.filter(image => image.status === 'analyzed'),
      detections: heroData.activeDetections,
    }
  }

  const activeDetections = runData.flatMap(item => item.activeDetections)
  const totalDetections = activeDetections.length
  const confidenceSum = activeDetections.reduce(
    (sum, detection) => sum + detection.confidence,
    0,
  )
  const averageConfidence = totalDetections === 0
    ? 0
    : Math.round((confidenceSum / totalDetections) * 1000) / 1000
  const map = heroRun
    ? buildMapPoints(heroRun.detections)
    : { points: [], hiddenCount: 0 }

  return {
    heroRun,
    stats: {
      totalRuns: runRows.length,
      totalDetections,
      pendingLowConfidence: activeDetections.filter(isPendingLowConfidence).length,
      averageConfidence,
      reportCount: new Set(reportRows.map(row => row.runId)).size,
      clauseCount: clauseRows.length,
      categoryMix: buildCategoryMix(activeDetections),
      confidenceBins: buildConfidenceBins(activeDetections),
    },
    mapPoints: map.points,
    hiddenMapPointCount: map.hiddenCount,
  }
}
