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
  // Report pages have no page-level selection store to drive, so evidence is
  // rendered as plain chips there instead of dead buttons.
  interactive?: boolean
  printHref?: string
  // The print route owns its single print affordance (PrintButton), so it
  // suppresses the preview's export button instead of showing two.
  showExport?: boolean
}) {
  const selectedClaim = useInspectionStore(s => s.selectedClaimId)
  const blocked = stale || exportBlocked

  function exportReport() {
    if (blocked) return
    if (printHref) window.open(printHref, '_blank', 'noopener')
    else window.print()
  }

  return (
    <article className="space-y-4">
      <header>
        <h1 className="font-heading text-xl font-semibold">{report.title}</h1>
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
        {report.claims.map(claim => (
          <section
            key={claim.id}
            data-claim-id={claim.id}
            aria-label={SECTION_LABELS[claim.section] ?? claim.section}
            className={interactive && selectedClaim === claim.id ? 'rounded bg-accent/10 p-2' : ''}
          >
            <h2 className="text-sm font-medium">
              {SECTION_LABELS[claim.section] ?? claim.section}：{claim.text}
            </h2>
            <div className="mt-1 flex flex-wrap gap-2">
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
                  <EvidenceLink key={id} type={kind} refId={refId}>
                    {id}
                  </EvidenceLink>
                )
              })}
            </div>
          </section>
        ))}
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
