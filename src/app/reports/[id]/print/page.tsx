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

  // The print page is the only path to "save as PDF". Rendering the report
  // body here would let Ctrl+P bypass the review gate, so a blocked report gets
  // a notice instead of its content.
  if (document.exportBlocked) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <nav aria-label="报告导航" className="text-xs print:hidden">
          <Link href={`/reports/${id}`} className="text-muted-foreground underline">
            ← 返回报告
          </Link>
        </nav>
        <section aria-label="报告暂不可导出" className="space-y-2 rounded-xl border border-border p-4">
          <h1 className="font-heading text-xl font-semibold">报告暂不可导出</h1>
          <p className="text-sm text-muted-foreground">
            报告或低置信识别结果尚待人工复核，请返回报告页完成复核并重新生成报告后再导出。
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link href={`/reports/${id}`} className="text-xs text-muted-foreground underline">
          ← 返回报告
        </Link>
        <PrintButton />
      </div>

      <ReportSections
        report={document.report}
        stale={document.stale}
        exportBlocked={document.exportBlocked}
        pendingReviewCount={document.pendingReviewCount}
        images={document.images}
        detections={document.detections}
        citedClauses={document.citedClauses}
        runId={id}
        runStatus={document.runStatus}
        mode="print"
      />
    </div>
  )
}
