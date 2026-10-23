import Link from 'next/link'
import { desc } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { reports } from '@/lib/db/schema'
import type { Severity } from '@/lib/domain/schemas'

export const dynamic = 'force-dynamic'

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  needs_review: '待复核',
  stale: '已过期',
}

const SEVERITY_LABELS: Record<Severity, string> = {
  low: '低',
  medium: '中',
  high: '高',
}

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
    const severity = metrics?.severity === 'low' || metrics?.severity === 'medium' || metrics?.severity === 'high'
      ? metrics.severity
      : null
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
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">报告库</h1>
      {latest.length === 0 && <p className="text-sm text-muted-foreground">还没有报告，先去巡检。</p>}
      {latest.map(row => {
        const summary = parseSummary(row.contentJson)
        const stale = row.status === 'stale'
        return (
          <Link
            key={row.runId}
            href={`/reports/${row.runId}`}
            className="block rounded-lg border border-border p-3 text-sm hover:bg-muted"
          >
            <div className="flex justify-between gap-3">
              <span>{summary.title}</span>
              <span className={`shrink-0 text-xs ${stale ? 'text-destructive' : 'text-muted-foreground'}`}>
                {STATUS_LABELS[row.status] ?? row.status} · {new Date(row.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
            {(summary.severity !== null || summary.intensity !== null) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {summary.severity !== null && `严重度 ${SEVERITY_LABELS[summary.severity]}`}
                {summary.severity !== null && summary.intensity !== null && ' · '}
                {summary.intensity !== null && `污染强度 ${summary.intensity}`}
              </p>
            )}
          </Link>
        )
      })}
    </div>
  )
}
