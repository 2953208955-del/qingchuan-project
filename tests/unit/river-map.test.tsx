// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RiverMap } from '@/components/dashboard/river-map'
import type { DashboardRun } from '@/lib/dashboard/types'
import type { MapPoint } from '@/lib/dashboard/types'

afterEach(cleanup)

const point = (overrides: Partial<MapPoint> = {}): MapPoint => ({
  id: 'p1', detectionId: 'd1', imageId: 'img1', category: 'plastic_bottle',
  label: '塑料瓶', confidence: 0.92, reviewStatus: 'confirmed',
  severity: 'normal', x: 20, y: 30, ...overrides,
})

const run: DashboardRun = {
  id: 'demo-run-001', instruction: '检查', location: '示例河段 A 段',
  status: 'awaiting_review', createdAt: 1, isDemo: true, hasReport: true,
  images: [], detections: [],
}

describe('RiverMap', () => {
  it('renders one button per point and the illustrative labels', () => {
    render(<RiverMap run={run} points={[point(), point({ id: 'p2', severity: 'review' })]} hiddenCount={0} summary={{ totalRuns: 5, reportCount: 4, clauseCount: 6 }} />)
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(2)
    expect(screen.getByText(/河道与点位为示意/)).toBeInTheDocument()
    expect(screen.getByText(/累计任务 5 · 报告 4 · 标准条款 6/)).toBeInTheDocument()
  })

  it('opens a dialog with real detection data and closes on Escape', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    fireEvent.click(document.querySelector('[data-map-point="p1"]')!)
    expect(screen.getByRole('dialog', { name: '塑料瓶识别详情' })).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看完整报告' })).toHaveAttribute('href', '/reports/demo-run-001')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows 报告尚未生成 when the run has no report', () => {
    render(<RiverMap run={{ ...run, hasReport: false }} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 0, clauseCount: 0 }} />)
    fireEvent.click(document.querySelector('[data-map-point="p1"]')!)
    expect(screen.getByText('报告尚未生成')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看完整报告' })).not.toBeInTheDocument()
  })

  it('renders the empty state without a run', () => {
    render(<RiverMap run={null} points={[]} hiddenCount={0} summary={{ totalRuns: 0, reportCount: 0, clauseCount: 0 }} />)
    expect(screen.getByText('暂无可展示的巡检任务')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(0)
  })

  it('discloses capped points', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={6} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    expect(screen.getByText(/展示 1\/7/)).toBeInTheDocument()
  })
})
