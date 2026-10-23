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

      {/* Ctrl+P on this page must not bypass review either: the body stays
          visible on screen but is replaced by this notice when printing. */}
      {document.exportBlocked && (
        <section aria-label="打印暂不可导出" className="hidden print:block">
          <h1 className="font-heading text-xl font-semibold">报告暂不可导出</h1>
          <p className="mt-2 text-sm">
            报告或低置信识别结果尚待人工复核，请复核完成后重新生成报告再打印或导出。
          </p>
        </section>
      )}

      <div className={document.exportBlocked ? 'print:hidden' : undefined}>
        <ReportSections
          report={document.report}
          stale={document.stale}
          exportBlocked={document.exportBlocked}
          pendingReviewCount={document.pendingReviewCount}
          images={document.images}
          detections={document.detections}
          runId={id}
          mode="page"
        />
      </div>
    </div>
  )
}
