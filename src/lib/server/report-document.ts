import { getDb } from '@/lib/db/client'
import { getLatestReport, getRun, listDetections, listImages } from '@/lib/db/repo'
import { ReportDraft } from '@/lib/domain/schemas'
import type { Detection, UploadedImage } from '@/lib/domain/schemas'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'

export type ReportDocument = {
  run: NonNullable<ReturnType<typeof getRun>>
  row: NonNullable<ReturnType<typeof getLatestReport>>
  report: ReportDraft
  images: UploadedImage[]
  detections: Detection[]
  stale: boolean
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

  return {
    run,
    row,
    report: parsed.data,
    images: parseImages(listImages(db, id)),
    detections: parseDetections(listDetections(db, id)),
    stale: row.status === 'stale',
  }
}
