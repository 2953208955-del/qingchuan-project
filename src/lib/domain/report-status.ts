import type { ReportStatus } from './schemas'

export type ReportStatusTone = 'cyan' | 'gold' | 'magenta' | 'muted'

type ReportStatusPresentation = {
  label: string
  tone: ReportStatusTone
}

// One source for archive labels and semantic colors: draft cyan, needs-review
// magenta (the alert color), stale gold to match the detail-page stale notice.
export const REPORT_STATUS_PRESENTATION = {
  draft: { label: '草稿', tone: 'cyan' },
  needs_review: { label: '待复核', tone: 'magenta' },
  stale: { label: '已过期', tone: 'gold' },
} satisfies Record<ReportStatus, ReportStatusPresentation>

export function reportStatusPresentation(status: string): ReportStatusPresentation {
  return (
    REPORT_STATUS_PRESENTATION[status as ReportStatus] ??
    { label: status, tone: 'muted' }
  )
}
