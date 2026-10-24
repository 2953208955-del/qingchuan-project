// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ReportReviewPanel } from '@/components/inspection/report-review-panel'
import { useInspectionStore } from '@/stores/inspection-store'
import type { Detection } from '@/lib/domain/schemas'

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

function detection(overrides: Partial<Detection> = {}): Detection {
  return {
    id: 'd1',
    imageId: 'img1',
    category: 'plastic_bag',
    material: null,
    confidence: 0.42,
    bbox: null,
    description: '',
    source: 'vlm',
    reviewStatus: 'pending',
    ...overrides,
  }
}

beforeEach(() => {
  useInspectionStore.setState(useInspectionStore.getInitialState())
  mocks.refresh.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ReportReviewPanel', () => {
  it('is visible for a persisted run with a pending low-confidence detection', () => {
    render(
      <ReportReviewPanel
        runId="r1"
        runStatus="awaiting_review"
        stale={false}
        detections={[detection()]}
      />,
    )
    expect(screen.getByRole('region', { name: '报告复核' })).toBeInTheDocument()
    expect(screen.getByText('需复核 1 项')).toBeInTheDocument()
  })

  it('offers only pending low-confidence rows, not every pending detection', () => {
    render(
      <ReportReviewPanel
        runId="r1"
        runStatus="awaiting_review"
        stale={false}
        detections={[
          detection({ id: 'low', confidence: 0.42 }),
          detection({ id: 'high-pending', confidence: 0.95 }),
        ]}
      />,
    )
    expect(screen.getByText('需复核 1 项')).toBeInTheDocument()
    expect(document.querySelector('[data-review-id="low"]')).not.toBeNull()
    expect(document.querySelector('[data-review-id="high-pending"]')).toBeNull()
  })

  it('stays visible even when the run status alone would not suggest review', () => {
    // Export is gated by pending rows, not by the run status; hiding the queue
    // here would make a blocked report impossible to unblock from this page.
    render(
      <ReportReviewPanel
        runId="r1"
        runStatus="completed"
        stale={false}
        detections={[detection()]}
      />,
    )
    expect(screen.getByRole('region', { name: '报告复核' })).toBeInTheDocument()
  })

  it('renders nothing when no low-confidence row is pending', () => {
    render(
      <ReportReviewPanel
        runId="r1"
        runStatus="awaiting_review"
        stale
        detections={[
          detection({ id: 'done', reviewStatus: 'confirmed' }),
          detection({ id: 'high', confidence: 0.95 }),
        ]}
      />,
    )
    expect(screen.queryByRole('region', { name: '报告复核' })).toBeNull()
  })

  it('refreshes the server-rendered document after a successful review PATCH', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ))
    render(
      <ReportReviewPanel
        runId="r1"
        runStatus="awaiting_review"
        stale={false}
        detections={[detection()]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledWith('/api/detections/d1', expect.objectContaining({ method: 'PATCH' }))
  })
})
