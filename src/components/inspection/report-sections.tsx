import type { Clause, Detection, ReportDraft, RunStatus, UploadedImage } from '@/lib/domain/schemas'
import { ClausePanel } from './clause-panel'
import { EvidenceCanvas } from './evidence-canvas'
import { RegenerateButton } from './regenerate-button'
import { ReportEvidenceCanvas } from './report-evidence-canvas'
import { ReportPreview } from './report-preview'
import { ReportReviewPanel } from './report-review-panel'

// Shared body for the report and print routes. The print variant suppresses the
// preview's export button because the print page owns the only print action.
export function ReportSections({
  report,
  stale,
  exportBlocked,
  pendingReviewCount,
  images,
  detections,
  citedClauses,
  runId,
  runStatus,
  mode,
}: {
  report: ReportDraft
  stale: boolean
  exportBlocked: boolean
  pendingReviewCount: number
  images: UploadedImage[]
  detections: Detection[]
  citedClauses: Clause[]
  runId: string
  runStatus: RunStatus
  mode: 'page' | 'print'
}) {
  const printable = mode === 'print'

  return (
    <>
      <ReportPreview
        report={report}
        stale={stale}
        exportBlocked={exportBlocked}
        interactive={!printable}
        printHref={printable ? undefined : `/reports/${runId}/print`}
        showExport={!printable}
      />

      {!printable && (
        <ReportReviewPanel
          runId={runId}
          runStatus={runStatus}
          stale={stale}
          detections={detections}
        />
      )}

      {!printable && exportBlocked && (
        <section
          aria-label="重新生成报告"
          className="report-section report-section--action"
          data-print-hide
        >
          <h2 className="report-section__title">重新生成报告</h2>
          <p className="report-section__hint">
            复核完成后，由代码基于最新识别结果重新生成报告；通过校验后即可导出。
          </p>
          <RegenerateButton runId={runId} pendingCount={pendingReviewCount} />
        </section>
      )}

      <section aria-label="引用标准" className="report-section">
        <h2 className="report-section__title">引用标准</h2>
        {/* The print route stays static; the page route uses the shared
            selectable ClausePanel so claims and clauses link both ways. */}
        {!printable && citedClauses.length > 0 ? (
          <ClausePanel clauses={citedClauses} />
        ) : report.citations.length === 0 ? (
          <p className="report-section__empty">无引用</p>
        ) : (
          <ul className="report-section__list">
            {report.citations.map((citation, index) => (
              <li key={`${citation.standardNo}-${citation.clauseNo}-${index}`}>
                {citation.standardNo} {citation.clauseNo}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="局限性" className="report-section">
        <h2 className="report-section__title">局限性</h2>
        {report.limitations.length === 0 ? (
          <p className="report-section__empty">无</p>
        ) : (
          <ul className="report-section__list">
            {report.limitations.map((limitation, index) => (
              <li key={`${index}-${limitation}`}>{limitation}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="证据附录" className="report-section report-section--evidence">
        <h2 className="report-section__title">证据附录</h2>
        {printable ? (
          <EvidenceCanvas images={images} detections={detections} />
        ) : (
          <ReportEvidenceCanvas images={images} detections={detections} claims={report.claims} />
        )}
      </section>
    </>
  )
}
