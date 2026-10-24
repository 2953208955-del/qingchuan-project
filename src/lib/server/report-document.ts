import { getDb } from '@/lib/db/client'
import type { Db } from '@/lib/db/client'
import {
  getLatestReport,
  getRun,
  listClausesByCitations,
  listClausesByIds,
  listDetections,
  listImages,
} from '@/lib/db/repo'
import { pendingLowConfidenceCount } from '@/lib/domain/review'
import { Clause, ReportDraft, ReportStatus, RunStatus } from '@/lib/domain/schemas'
import type { Detection, UploadedImage } from '@/lib/domain/schemas'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'

export type ReportDocument = {
  run: NonNullable<ReturnType<typeof getRun>>
  row: NonNullable<ReturnType<typeof getLatestReport>>
  report: ReportDraft
  images: UploadedImage[]
  detections: Detection[]
  // Clauses referenced by the report, loaded server-side for the interactive
  // cited-clause panel. The print route ignores interactivity but receives the
  // same document so both routes share one load path.
  citedClauses: Clause[]
  runStatus: RunStatus
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
// renders unparsed content. The explicit `db` overload lets tests exercise the
// same gate against an in-memory database.
export function loadReportDocumentFrom(db: Db, id: string): ReportDocument | null {
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
  const effectiveRunStatus = runStatus.success ? runStatus.data : 'awaiting_review'

  // Claims cite clauses by `clause:<id>`; older drafts may only carry
  // {standardNo, clauseNo}. Fall back so the panel is never empty just because
  // a report predates evidence ids.
  const clauseIds = [...new Set(parsed.data.claims
    .flatMap(claim => claim.evidenceIds)
    .filter(evidenceId => evidenceId.startsWith('clause:'))
    .map(evidenceId => evidenceId.slice('clause:'.length)))]
  const clauseRows = clauseIds.length > 0
    ? listClausesByIds(db, clauseIds)
    : listClausesByCitations(db, parsed.data.citations)
  const citedClauses = clauseRows.flatMap(row => {
    const clause = Clause.safeParse({
      id: row.id,
      standardNo: row.standardNo,
      clauseNo: row.clauseNo,
      title: row.title,
      content: row.content,
      score: 0,
    })
    return clause.success ? [clause.data] : []
  })

  return {
    run,
    row,
    report: parsed.data,
    images: parseImages(listImages(db, id)),
    detections,
    citedClauses,
    runStatus: effectiveRunStatus,
    stale: row.status === 'stale',
    exportBlocked: isExportBlocked({
      reportStatus: reportStatus.success ? reportStatus.data : 'needs_review',
      runStatus: effectiveRunStatus,
      detections,
    }),
    pendingReviewCount: pendingLowConfidenceCount(detections),
  }
}

export function loadReportDocument(id: string): ReportDocument | null {
  return loadReportDocumentFrom(getDb(), id)
}
