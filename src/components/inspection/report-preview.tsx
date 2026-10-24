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
    <article className="space-y-4">
      <header>
        <h1 className="font-heading text-xl font-semibold">{report.title}</h1>
        {/* Demo data is hand-built; never present it as live model output. */}
        {report.source === 'manual' && (
          <p
            role="note"
            className="mt-2 inline-flex rounded border border-accent/50 bg-accent/10 px-2 py-1 text-xs text-foreground"
          >
            人工构造示例 · 非实时 AI 输出，不代表评测结果
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {report.location ?? '未填写地点'} · {report.inspectedAt}
        </p>
      </header>

      {/* Every number is read from the persisted report metrics; nothing is
          recomputed in the browser. */}
      <section aria-label="报告指标" className="rounded-xl border border-border p-3">
        <h2 className="text-sm font-medium">指标摘要</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">严重度</dt>
            <dd>{SEVERITY_LABELS[report.metrics.severity]}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">污染强度</dt>
            <dd>{report.metrics.intensity}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">图片数</dt>
            <dd>{report.metrics.imageCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">识别目标数</dt>
            <dd>{report.metrics.detectionCount}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">公式版本</dt>
            <dd>{report.metrics.formulaVersion}</dd>
          </div>
        </dl>
      </section>

      <div className="space-y-3">
        {report.claims.map(claim => {
          const active = interactive && selectedClaim === claim.id
          const linked = claimLinkedToSelection(claim)
          return (
            <section
              key={claim.id}
              data-claim-id={claim.id}
              data-linked={linked ? 'true' : undefined}
              aria-label={SECTION_LABELS[claim.section] ?? claim.section}
              className={`${active ? 'rounded bg-accent/10 p-2' : ''} ${linked && !active ? 'rounded border-l-2 border-accent bg-accent/5 py-1 pl-2' : ''}`}
            >
              <h2 className="text-sm font-medium">
                {SECTION_LABELS[claim.section] ?? claim.section}：{claim.text}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {claim.evidenceIds.map(id => {
                  const kind = id.startsWith('detection:') ? 'detection' : id.startsWith('clause:') ? 'clause' : null
                  if (!kind) {
                    return <span key={id} className="text-xs text-muted-foreground">{id}</span>
                  }
                  const refId = id.slice(kind.length + 1)
                  if (!interactive) {
                    return (
                      <span key={id} title={kind === 'clause' ? '标准条款' : '识别证据'} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
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
                    className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-muted"
                  >
                    定位证据
                  </button>
                )}
              </div>
            </section>
          )
        })}
      </div>

      <footer className="space-y-1 text-xs text-muted-foreground">
        <p>
          模型：{report.modelInfo.textModel} / {report.modelInfo.visionModel} · Prompt {report.modelInfo.promptVersion}
        </p>
        {stale && (
          <p role="alert" className="text-destructive">
            识别结果已修改，当前报告已过期；请复核完成后在报告页重新生成报告。
          </p>
        )}
        {!stale && exportBlocked && (
          <p role="status">
            报告或低置信识别结果尚待人工复核，复核完成前不能导出。
          </p>
        )}
      </footer>

      {showExport && (
        <div className="flex gap-2 print:hidden">
          <button
            type="button"
            onClick={exportReport}
            disabled={blocked}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            导出 PDF
          </button>
        </div>
      )}
    </article>
  )
}
