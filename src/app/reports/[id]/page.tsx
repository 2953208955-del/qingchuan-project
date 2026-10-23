import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReportSections } from '@/components/inspection/report-sections'
import { loadReportDocument } from '@/lib/server/report-document'

export const dynamic = 'force-dynamic'

// `id` is the run id: the report version is resolved server-side from the latest
// persisted row so a re-generated report always wins.
export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const document = loadReportDocument(id)
  if (!document) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="报告导航" className="text-xs print:hidden">
        <Link href="/inspect" className="text-muted-foreground underline">
          ← 返回巡检工作台
        </Link>
      </nav>

      <ReportSections
        report={document.report}
        stale={document.stale}
        images={document.images}
        detections={document.detections}
        runId={id}
        mode="page"
      />
    </div>
  )
}
