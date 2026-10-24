// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ClausePanel } from '@/components/inspection/clause-panel'
import { EvidenceLink } from '@/components/inspection/evidence-link'
import { ReportPreview } from '@/components/inspection/report-preview'
import { ReviewQueue } from '@/components/inspection/review-queue'
import { isExportBlocked } from '@/lib/server/report-document'
import { useInspectionStore } from '@/stores/inspection-store'
import type { Detection } from '@/lib/domain/schemas'

const report = {
  title: '报告', location: null, inspectedAt: '2026-10-22T00:00:00.000Z',
  claims: [{ id: 'c1', section: 'summary' as const, text: '发现 1 个塑料瓶', evidenceIds: ['detection:d1'] }],
  metrics: { imageCount: 1, detectionCount: 1, weightedTotal: 1.2, intensity: 1.2, severity: 'low' as const, formulaVersion: 'severity-v1' },
  citations: [], modelInfo: { textModel: 'deepseek-chat', visionModel: 'm', promptVersion: 'reporter-v1' }, limitations: [],
}

function detection(overrides: Partial<Detection>): Detection {
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
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('EvidenceLink', () => {
  it('selects a detection when clicked', () => {
    render(<EvidenceLink type="detection" refId="d1">证据 1</EvidenceLink>)
    fireEvent.click(screen.getByRole('button', { name: '证据 1' }))
    expect(useInspectionStore.getState().selectedDetectionId).toBe('d1')
  })

  it('selects a clause when clicked', () => {
    render(<EvidenceLink type="clause" refId="c1">条款 1</EvidenceLink>)
    fireEvent.click(screen.getByRole('button', { name: '条款 1' }))
    expect(useInspectionStore.getState().selectedClauseId).toBe('c1')
  })

  it('disables export when the report is stale', () => {
    render(<ReportPreview report={report} stale />)
    expect(screen.getByRole('button', { name: '导出 PDF' })).toBeDisabled()
  })
})

describe('export gate', () => {
  it('blocks export while the report row needs review', () => {
    expect(isExportBlocked({ reportStatus: 'needs_review', runStatus: 'completed', detections: [] })).toBe(true)
  })

  it('blocks export while a pending detection is below 0.5 confidence', () => {
    expect(
      isExportBlocked({
        reportStatus: 'draft',
        runStatus: 'completed',
        detections: [detection({ confidence: 0.42, reviewStatus: 'pending' })],
      }),
    ).toBe(true)
  })

  it('blocks export while the run waits for review', () => {
    expect(isExportBlocked({ reportStatus: 'draft', runStatus: 'awaiting_review', detections: [] })).toBe(true)
  })

  it('allows export once the draft is clean and no low-confidence item is pending', () => {
    expect(
      isExportBlocked({
        reportStatus: 'draft',
        runStatus: 'completed',
        detections: [
          detection({ id: 'd1', confidence: 0.42, reviewStatus: 'confirmed' }),
          detection({ id: 'd2', confidence: 0.9, reviewStatus: 'pending' }),
        ],
      }),
    ).toBe(false)
  })

  it('disables the export button for a gated report that is not stale', () => {
    render(<ReportPreview report={report} stale={false} exportBlocked />)
    expect(screen.getByRole('button', { name: '导出 PDF' })).toBeDisabled()
    expect(screen.getByText(/尚待人工复核/)).toBeInTheDocument()
  })
})

describe('ReportPreview', () => {
  it('renders the stale banner and the report metrics verbatim', () => {
    render(<ReportPreview report={report} stale />)
    expect(screen.getByText(/当前报告已过期/)).toBeInTheDocument()
    const metrics = within(screen.getByRole('region', { name: '报告指标' }))
    expect(metrics.getByText('低')).toBeInTheDocument()
    expect(metrics.getByText('1.2')).toBeInTheDocument()
    expect(metrics.getByText('severity-v1')).toBeInTheDocument()
    expect(metrics.getAllByText('1')).toHaveLength(2)
  })

  it('shows a manual-construction badge for the demo report', () => {
    render(<ReportPreview report={{ ...report, source: 'manual' }} stale={false} />)
    expect(screen.getByRole('note')).toHaveTextContent('人工构造示例 · 非实时 AI 输出')
  })

  it('does not show the manual badge for AI-generated reports', () => {
    render(<ReportPreview report={{ ...report, source: 'ai' }} stale={false} />)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('renders evidence as plain chips without buttons when not interactive', () => {
    render(<ReportPreview report={report} stale={false} interactive={false} />)
    expect(screen.queryByRole('button', { name: 'detection:d1' })).toBeNull()
    expect(screen.getByText('detection:d1')).toBeInTheDocument()
  })

  it('opens the print href instead of calling window.print when provided', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    render(<ReportPreview report={report} stale={false} printHref="/reports/r1/print" />)
    fireEvent.click(screen.getByRole('button', { name: '导出 PDF' }))
    expect(open).toHaveBeenCalledWith('/reports/r1/print', '_blank', 'noopener')
  })

  it('links evidence back to the claims that cite it on the report page', () => {
    render(<ReportPreview report={report} stale={false} />)
    const claim = document.querySelector('[data-claim-id="c1"]')
    expect(claim).not.toHaveAttribute('data-linked')

    fireEvent.click(screen.getByRole('button', { name: 'detection:d1' }))

    expect(useInspectionStore.getState().selectedDetectionId).toBe('d1')
    expect(document.querySelector('[data-claim-id="c1"]')).toHaveAttribute('data-linked', 'true')
  })

  it('focuses cited detections and clauses when a claim is selected, and links clause evidence back', () => {
    const linkedReport = {
      ...report,
      claims: [{
        id: 'c1', section: 'summary' as const, text: '发现 1 个塑料瓶',
        evidenceIds: ['detection:d1', 'clause:clause-1'],
      }],
    }
    render(<ReportPreview report={linkedReport} stale={false} />)

    fireEvent.click(screen.getByRole('button', { name: '定位证据' }))
    expect(useInspectionStore.getState().selectedClaimId).toBe('c1')
    expect(useInspectionStore.getState().selectedDetectionId).toBe('d1')
    expect(useInspectionStore.getState().selectedClauseId).toBe('clause-1')
    expect(document.querySelector('[data-claim-id="c1"]')).toHaveAttribute('data-linked', 'true')
  })

  it('marks a claim as linked when its cited clause is selected', () => {
    const linkedReport = {
      ...report,
      claims: [{
        id: 'c1', section: 'summary' as const, text: '发现 1 个塑料瓶',
        evidenceIds: ['clause:clause-1'],
      }],
    }
    render(<ReportPreview report={linkedReport} stale={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'clause:clause-1' }))

    expect(useInspectionStore.getState().selectedClauseId).toBe('clause-1')
    expect(document.querySelector('[data-claim-id="c1"]')).toHaveAttribute('data-linked', 'true')
  })
})

describe('ClausePanel', () => {
  it('selects a cited clause so its claims can be identified', () => {
    render(<ClausePanel clauses={[
      { id: 'clause-1', standardNo: '清川SOP', clauseNo: '第3条', title: '严重度', content: '按加权检出量分级', score: 0.8 },
    ]} />)

    fireEvent.click(screen.getByRole('button', { name: /清川SOP 第3条/ }))

    expect(useInspectionStore.getState().selectedClauseId).toBe('clause-1')
    expect(document.querySelector('[data-clause-id="clause-1"]')).toHaveAttribute('aria-current', 'true')
  })
})

describe('ReviewQueue', () => {
  it('renders only pending detections and sends the correction PATCH body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const onChanged = vi.fn()
    render(
      <ReviewQueue
        runId="r1"
        detections={[
          detection({ id: 'd1', imageId: 'img1', confidence: 0.42 }),
          detection({ id: 'd2', imageId: 'img2', confidence: 0.95, reviewStatus: 'confirmed' }),
        ]}
        onChanged={onChanged}
      />,
    )

    expect(screen.getByText('需复核 1 项')).toBeInTheDocument()
    expect(screen.getByText('低置信度')).toBeInTheDocument()
    expect(document.querySelector('[data-review-id="d2"]')).toBeNull()

    fireEvent.change(screen.getByLabelText('纠正类别'), { target: { value: 'plastic_bag' } })
    fireEvent.click(screen.getByRole('button', { name: '纠错' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock).toHaveBeenCalledWith('/api/detections/d1', expect.objectContaining({ method: 'PATCH' }))
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({
      reviewStatus: 'corrected',
      category: 'plastic_bag',
      hint: '人工改为塑料袋',
      runId: 'r1',
      imageId: 'img1',
    })
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })

  it('surfaces a failed review as an alert and does not notify the parent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: '识别结果不存在' }), { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const onChanged = vi.fn()
    render(<ReviewQueue runId="r1" detections={[detection({ id: 'd1' })]} onChanged={onChanged} />)

    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('识别结果不存在')
    expect(onChanged).not.toHaveBeenCalled()
  })
})
