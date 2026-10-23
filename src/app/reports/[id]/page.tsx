import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getDb } from '@/lib/db/client'
import { getLatestReport, getRun, listDetections, listImages } from '@/lib/db/repo'
import { ReportPreview } from '@/components/inspection/report-preview'
import { EvidenceCanvas } from '@/components/inspection/evidence-canvas'
import { ReportDraft } from '@/lib/domain/schemas'
import { parseDetections, parseImages } from '@/lib/domain/run-detail'

export const dynamic = 'force-dynamic'

// `id` is the run id: the report version is resolved server-side from the latest
// persisted row so a re-generated report always wins.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = getDb()
  const run = getRun(db, id)
  const row = getLatestReport(db, id)
  if (!run || !row) notFound()

  let content: unknown = null
  try {
    content = JSON.parse(row.contentJson)
  } catch {
    notFound()
  }
  const parsed = ReportDraft.safeParse(content)
  if (!parsed.success) notFound()
  const report = parsed.data

  const images = parseImages(listImages(db, id))
  const detections = parseDetections(listDetections(db, id))

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="报告导航" className="text-xs print:hidden">
        <Link href="/inspect" className="text-muted-foreground underline">
          ← 返回巡检工作台
        </Link>
      </nav>

      <ReportPreview
        report={report}
        stale={row.status === 'stale'}
        interactive={false}
        printHref={`/reports/${id}/print`}
      />

      <section aria-label="引用标准" className="space-y-2">
        <h2 className="text-sm font-medium">引用标准</h2>
        {report.citations.length === 0 ? (
          <p className="text-sm text-muted-foreground">无引用</p>
        ) : (
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {report.citations.map((citation, index) => (
              <li key={`${citation.standardNo}-${citation.clauseNo}-${index}`}>
                {citation.standardNo} {citation.clauseNo}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="局限性" className="space-y-2">
        <h2 className="text-sm font-medium">局限性</h2>
        {report.limitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">无</p>
        ) : (
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {report.limitations.map((limitation, index) => (
              <li key={`${index}-${limitation}`}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="证据附录" className="space-y-2">
        <h2 className="text-sm font-medium">证据附录</h2>
        <EvidenceCanvas images={images} detections={detections} />
      </section>
    </div>
  )
}
