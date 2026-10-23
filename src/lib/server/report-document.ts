import { getDb } from '@/lib/db/client'
import { getLatestReport, getRun, listDetections, listImages } from '@/lib/db/repo'
import { pendingLowConfidenceCount } from '@/lib/domain/review'
import { ReportDraft, ReportStatus, RunStatus } from '@/lib/domain/schemas'
import type { Detection, UploadedImage } from '@/lib/domain/schemas'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'

export type ReportDocument = {
  run: NonNullable<ReturnType<typeof getRun>>
  row: NonNullable<ReturnType<typeof getLatestReport>>
  report: ReportDraft
  images: UploadedImage[]
  detections: Detection[]
  stale: boolean
  // Export stays locked until the report and every low-confidence finding have
  // passed human review; the loader is the single place that decides this.
  exportBlocked: boolean
  pendingReviewCount: number
}

export function isExportBlocked(input: {
  reportStatus: ReportStatus
  runStatus: RunStatus
  detections: Pick<Detection, 'reviewStatus' | 'confidence'>[]
}): boolean {
  return (
    input.reportStatus === 'stale' ||
    input.reportStatus === 'needs_review' ||
    input.runStatus === 'awaiting_review' ||
    pendingLowConfidenceCount(input.detections) > 0
  )
}

// Single load path for both the report and print routes. Missing rows or a
// corrupt draft return null so each page can call notFound(); neither page ever
// renders unparsed content.
export function loadReportDocument(id: string): ReportDocument | null {
  const db = getDb()
  const run = getRun(db, id)
  const row = getLatestReport(db, id)
  if (!run || !row) return null

  let content: unknown = null
  try {
    content = JSON.parse(row.contentJson)
  } catch {
    return null
  }
  const parsed = ReportDraft.safeParse(content)
  if (!parsed.success) return null

  const detections = parseDetections(listDetections(db, id))
  // Unknown persisted statuses default to the blocking value: a row written by
  // an older schema must never unlock export.
  const reportStatus = ReportStatus.safeParse(row.status)
  const runStatus = RunStatus.safeParse(run.status)

  return {
    run,
    row,
    report: parsed.data,
    images: parseImages(listImages(db, id)),
    detections,
    stale: row.status === 'stale',
    exportBlocked: isExportBlocked({
      reportStatus: reportStatus.success ? reportStatus.data : 'needs_review',
      runStatus: runStatus.success ? runStatus.data : 'awaiting_review',
      detections,
    }),
    pendingReviewCount: pendingLowConfidenceCount(detections),
  }
}
