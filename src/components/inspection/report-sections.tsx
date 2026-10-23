import type { Detection, ReportDraft, UploadedImage } from '@/lib/domain/schemas'
import { EvidenceCanvas } from './evidence-canvas'
import { ReportPreview } from './report-preview'

// Shared body for the report and print routes. The print variant suppresses the
// preview's export button because the print page owns the only print action.
export function ReportSections({
  report,
  stale,
  images,
  detections,
  runId,
  mode,
}: {
  report: ReportDraft
  stale: boolean
  images: UploadedImage[]
  detections: Detection[]
  runId: string
  mode: 'page' | 'print'
}) {
  const printable = mode === 'print'

  return (
    <>
      <ReportPreview
        report={report}
        stale={stale}
        interactive={false}
        printHref={printable ? undefined : `/reports/${runId}/print`}
        showExport={!printable}
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
    </>
  )
}
