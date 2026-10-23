import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ReportSections } from '@/components/inspection/report-sections'
import { PrintButton } from '@/components/inspection/print-button'
import { loadReportDocument } from '@/lib/server/report-document'

export const dynamic = 'force-dynamic'

export default async function ReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const document = loadReportDocument(id)
  if (!document) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/reports/${id}`} className="text-xs text-muted-foreground underline">
          ← 返回报告
        </Link>
        {!document.stale && <PrintButton />}
      </div>

      <ReportSections
        report={document.report}
        stale={document.stale}
        images={document.images}
        detections={document.detections}
        runId={id}
        mode="print"
      />
    </div>
  )
}
