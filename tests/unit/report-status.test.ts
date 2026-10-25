import { describe, expect, it } from 'vitest'
import {
  REPORT_STATUS_PRESENTATION,
  reportStatusPresentation,
} from '@/lib/domain/report-status'

describe('report status presentation', () => {
  it('keeps archive tones aligned with the detail page and design spec', () => {
    expect(REPORT_STATUS_PRESENTATION).toEqual({
      draft: { label: '草稿', tone: 'cyan' },
      needs_review: { label: '待复核', tone: 'magenta' },
      stale: { label: '已过期', tone: 'gold' },
    })
  })

  it('falls back to a muted badge for an unknown persisted status', () => {
    expect(reportStatusPresentation('legacy_status')).toEqual({
      label: 'legacy_status',
      tone: 'muted',
    })
  })
})
