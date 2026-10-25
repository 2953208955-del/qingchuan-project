'use client'

import { SEVERITY_LABELS, type ReportDraft } from '@/lib/domain/schemas'
import { EvidenceLink } from './evidence-link'
import { useInspectionStore } from '@/stores/inspection-store'

const SECTION_LABELS: Record<string, string> = {
  summary: '摘要', findings: '发现', severity: '严重度', recommendations: '整改建议', limitations: '局限性',
}

export function ReportPreview({
  report,
  stale,
  exportBlocked = false,
  interactive = true,
  printHref,
  showExport = true,
}: {
  report: ReportDraft
  stale: boolean
  // True when the persisted report/run still needs human review or a
  // low-confidence detection is unreviewed; the loader computes it.
  exportBlocked?: boolean
  // The print route renders static chips and never reads the selection store;
  // the report page opts in to the three-way evidence linking.
  interactive?: boolean
  printHref?: string
  // The print route owns its single print affordance (PrintButton), so it
  // suppresses the preview's export button instead of showing two.
  showExport?: boolean
}) {
  const selectedClaim = useInspectionStore(s => s.selectedClaimId)
  const selectedDetectionId = useInspectionStore(s => s.selectedDetectionId)
  const selectedClauseId = useInspectionStore(s => s.selectedClauseId)
  const setSelectedClaim = useInspectionStore(s => s.setSelectedClaim)
  const setSelectedDetection = useInspectionStore(s => s.setSelectedDetection)
  const setSelectedClause = useInspectionStore(s => s.setSelectedClause)
  const blocked = stale || exportBlocked

  function exportReport() {
    if (blocked) return
    if (printHref) window.open(printHref, '_blank', 'noopener')
    else window.print()
  }

  // Selecting a claim focuses its first cited detection/clause so the image
  // canvas and clause panel immediately highlight it. Conversely, selecting a
  // box or clause highlights every claim that cites it.
  function focusClaim(claim: ReportDraft['claims'][number]) {
    setSelectedClaim(claim.id)
    const detectionId = claim.evidenceIds.find(id => id.startsWith('detection:'))
    const clauseId = claim.evidenceIds.find(id => id.startsWith('clause:'))
    setSelectedDetection(detectionId ? detectionId.slice('detection:'.length) : null)
    setSelectedClause(clauseId ? clauseId.slice('clause:'.length) : null)
  }

  function claimLinkedToSelection(claim: ReportDraft['claims'][number]): boolean {
    if (!interactive) return false
    return claim.evidenceIds.some(id =>
      (selectedDetectionId !== null && id === `detection:${selectedDetectionId}`) ||
      (selectedClauseId !== null && id === `clause:${selectedClauseId}`),
    )
  }

  return (
    <article className="report-article">
      <header className="report-header">
        <h1 className="report-title">{report.title}</h1>
        {/* Demo data is hand-built; never present it as live model output. */}
        {report.source === 'manual' && (
          <p role="note" className="report-note">
            人工构造示例 · 非实时 AI 输出，不代表评测结果
          </p>
        )}
        <p className="report-meta">
          {report.location ?? '未填写地点'} · {report.inspectedAt}
        </p>
      </header>

      {/* Every number is read from the persisted report metrics; nothing is
          recomputed in the browser. */}
      <section aria-label="报告指标" className="report-metrics">
        <h2 className="report-section__title">指标摘要</h2>
        <dl className="report-metrics__grid">
          <div className="report-metrics__item">
            <dt>严重度</dt>
            <dd>{SEVERITY_LABELS[report.metrics.severity]}</dd>
          </div>
          <div className="report-metrics__item">
            <dt>污染强度</dt>
            <dd>{report.metrics.intensity}</dd>
          </div>
          <div className="report-metrics__item">
            <dt>图片数</dt>
            <dd>{report.metrics.imageCount}</dd>
          </div>
          <div className="report-metrics__item">
            <dt>识别目标数</dt>
            <dd>{report.metrics.detectionCount}</dd>
          </div>
          <div className="report-metrics__item">
            <dt>公式版本</dt>
            <dd>{report.metrics.formulaVersion}</dd>
          </div>
        </dl>
      </section>

      <div className="report-claims">
        {report.claims.map(claim => {
          const active = interactive && selectedClaim === claim.id
          const linked = claimLinkedToSelection(claim)
          return (
            <section
              key={claim.id}
              data-claim-id={claim.id}
              data-linked={linked ? 'true' : undefined}
              aria-label={SECTION_LABELS[claim.section] ?? claim.section}
              className={`report-claim${active ? ' is-active' : ''}${linked ? ' is-linked' : ''}`}
            >
              <h2 className="report-claim__title">
                {SECTION_LABELS[claim.section] ?? claim.section}：{claim.text}
              </h2>
              <div className="report-claim__evidence">
                {claim.evidenceIds.map(id => {
                  const kind = id.startsWith('detection:') ? 'detection' : id.startsWith('clause:') ? 'clause' : null
                  if (!kind) {
                    return <span key={id} className="report-claim__raw">{id}</span>
                  }
                  const refId = id.slice(kind.length + 1)
                  if (!interactive) {
                    return (
                      <span
                        key={id}
                        title={kind === 'clause' ? '标准条款' : '识别证据'}
                        className="holo-chip holo-chip--static"
                      >
                        {id}
                      </span>
                    )
                  }
                  return (
                    <EvidenceLink
                      key={id}
                      type={kind}
                      refId={refId}
                      active={kind === 'detection' ? selectedDetectionId === refId : selectedClauseId === refId}
                    >
                      {id}
                    </EvidenceLink>
                  )
                })}
                {interactive && (
                  <button
                    type="button"
                    onClick={() => focusClaim(claim)}
                    aria-pressed={active}
                    className="holo-btn report-claim__locate"
                  >
                    定位证据
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <footer className="report-footer">
        <p>
          模型：{report.modelInfo.textModel} / {report.modelInfo.visionModel} · Prompt {report.modelInfo.promptVersion}
        </p>
        {stale && (
          <p role="alert" className="report-alert report-alert--stale">
            识别结果已修改，当前报告已过期；请复核完成后在报告页重新生成报告。
          </p>
        )}
        {!stale && exportBlocked && (
          <p role="status" className="report-alert report-alert--blocked">
            报告或低置信识别结果尚待人工复核，复核完成前不能导出。
          </p>
        )}
      </footer>

      {showExport && (
        <div className="report-actions print:hidden" data-print-hide>
          <button
            type="button"
            onClick={exportReport}
            disabled={blocked}
            className="holo-btn holo-btn--primary"
          >
            导出 PDF
          </button>
        </div>
      )}
    </article>
  )
}
