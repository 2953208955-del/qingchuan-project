import Link from 'next/link'
import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { reports } from '@/lib/db/schema'
import { HoloBadge } from '@/components/holo/holo-badge'
import { reportStatusPresentation } from '@/lib/domain/report-status'
import { SEVERITY_LABELS, Severity } from '@/lib/domain/schemas'

export const dynamic = 'force-dynamic'

type ReportSummary = {
  title: string
  severity: Severity | null
  intensity: number | null
}

// contentJson is written by the agent, but the library must never 500 on a row
// left behind by an older schema or a partial write: fall back to a generic
// title and omit the metrics when the payload cannot be trusted.
function parseSummary(contentJson: string): ReportSummary {
  try {
    const raw: unknown = JSON.parse(contentJson)
    if (!raw || typeof raw !== 'object') return { title: '巡检报告', severity: null, intensity: null }

    const record = raw as { title?: unknown; metrics?: unknown }
    const title = typeof record.title === 'string' && record.title.trim() ? record.title : '巡检报告'
    const metrics = record.metrics && typeof record.metrics === 'object'
      ? record.metrics as { severity?: unknown; intensity?: unknown }
      : null
    const parsedSeverity = Severity.safeParse(metrics?.severity)
    const severity = parsedSeverity.success ? parsedSeverity.data : null
    const intensity = typeof metrics?.intensity === 'number' && Number.isFinite(metrics.intensity)
      ? metrics.intensity
      : null

    return { title, severity, intensity }
  } catch {
    return { title: '巡检报告', severity: null, intensity: null }
  }
}

export default function ReportsPage() {
  // Version descending with createdAt as the tie-break means the first row seen
  // for a run is its latest report. The map then drops older versions.
  const rows = getDb()
    .select()
    .from(reports)
    .orderBy(desc(reports.version), desc(reports.createdAt))
    .all()
  const latestByRun = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    if (!latestByRun.has(row.runId)) latestByRun.set(row.runId, row)
  }
  const latest = [...latestByRun.values()].sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="reports-library">
      <header className="reports-hero">
        <p className="holo-eyebrow">QINGCHUAN · REPORT ARCHIVE</p>
        <h1>报告库</h1>
        <p className="reports-hero__lede">
          每个巡检任务只展示最新版本报告；状态、严重度与污染强度均读取自持久化结果。
        </p>
      </header>

      {latest.length === 0 ? (
        <div className="holo-empty">
          <span className="holo-empty__mark" aria-hidden>◇</span>
          <p>还没有报告，先去巡检。</p>
        </div>
      ) : (
        <div className="reports-list">
          {latest.map(row => {
            const summary = parseSummary(row.contentJson)
            const status = reportStatusPresentation(row.status)
            return (
              <Link
                key={row.runId}
                href={`/reports/${row.runId}`}
                className="holo-report-row"
              >
                <div className="holo-report-row__head">
                  <span className="holo-report-row__title">{summary.title}</span>
                  <span className="holo-report-row__status">
                    <HoloBadge tone={status.tone}>{status.label}</HoloBadge>
                    <time
                      dateTime={new Date(row.createdAt).toISOString()}
                      className="holo-report-row__time"
                    >
                      {new Date(row.createdAt).toLocaleString('zh-CN')}
                    </time>
                  </span>
                </div>
                {(summary.severity !== null || summary.intensity !== null) && (
                  <div className="holo-report-row__chips">
                    {summary.severity !== null && (
                      <HoloBadge tone="muted">严重度 {SEVERITY_LABELS[summary.severity]}</HoloBadge>
                    )}
                    {summary.intensity !== null && (
                      <HoloBadge tone="cyan">污染强度 {summary.intensity}</HoloBadge>
                    )}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
