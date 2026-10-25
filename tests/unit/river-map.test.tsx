// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RiverMap, spreadNarrowMapPoints } from '@/components/dashboard/river-map'
import { MAP_ANCHORS } from '@/lib/dashboard/map-points'
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

const realAnchors = (): MapPoint[] =>
  MAP_ANCHORS.map((anchor, index) =>
    point({ id: `dense-${index}`, x: anchor.x, y: anchor.y }),
  )

function expectAxisAlignedSeparation(
  placed: MapPoint[],
  width: number,
  height: number,
  separation: number,
) {
  for (let i = 0; i < placed.length; i += 1) {
    for (let j = i + 1; j < placed.length; j += 1) {
      const dx = (Math.abs(placed[i].x - placed[j].x) / 100) * width
      const dy = (Math.abs(placed[i].y - placed[j].y) / 100) * height
      expect(dx >= separation || dy >= separation).toBe(true)
    }
  }
}

describe('spreadNarrowMapPoints', () => {
  it('separates all 24 real anchors with the 28px mobile marker', () => {
    const anchors = realAnchors()
    const placed = spreadNarrowMapPoints(anchors, 326, 204, 28)

    expect(placed).not.toBe(anchors)
    expect(placed).toHaveLength(24)
    expectAxisAlignedSeparation(placed, 326, 204, 30)
    for (const point of placed) {
      expect((point.x / 100) * 326).toBeGreaterThanOrEqual(16)
      expect((point.x / 100) * 326).toBeLessThanOrEqual(310)
      expect((point.y / 100) * 204).toBeGreaterThanOrEqual(16)
      expect((point.y / 100) * 204).toBeLessThanOrEqual(188)
    }
  })

  it('separates the 641–740px canvas band with its real 34px markers', () => {
    const anchors = realAnchors()
    const placed = spreadNarrowMapPoints(anchors, 700, 438, 34)

    expect(placed).not.toBe(anchors)
    expectAxisAlignedSeparation(placed, 700, 438, 36)
  })

  it('leaves the real anchors untouched when they already clear 34px markers', () => {
    const anchors = realAnchors()
    expect(spreadNarrowMapPoints(anchors, 1200, 480, 34)).toBe(anchors)
  })
})

describe('RiverMap', () => {
  it('renders one button per point and the illustrative labels', () => {
    render(<RiverMap run={run} points={[point(), point({ id: 'p2', severity: 'review' })]} hiddenCount={0} summary={{ totalRuns: 5, reportCount: 4, clauseCount: 6 }} />)
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(2)
    expect(screen.getByText(/河道与点位为示意/)).toBeInTheDocument()
    expect(screen.getByText(/累计任务 5 · 报告 4 · 标准条款 6/)).toBeInTheDocument()
  })

  it('opens a dialog with real detection data, closes on Escape and returns focus', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    const marker = document.querySelector('[data-map-point="p1"]') as HTMLButtonElement
    fireEvent.click(marker)
    expect(screen.getByRole('dialog', { name: '塑料瓶识别详情' })).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看完整报告' })).toHaveAttribute('href', '/reports/demo-run-001')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(marker)
  })

  it('closes the popover when the open marker is pressed again', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    const marker = document.querySelector('[data-map-point="p1"]')!
    fireEvent.click(marker)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(marker)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('falls back to 未填写地点 for a run with no location and 暂无任务 without a run', () => {
    const { unmount } = render(
      <RiverMap run={{ ...run, location: null }} points={[]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 0, clauseCount: 0 }} />,
    )
    expect(screen.getByText('未填写地点')).toBeInTheDocument()
    unmount()

    render(<RiverMap run={null} points={[]} hiddenCount={0} summary={{ totalRuns: 0, reportCount: 0, clauseCount: 0 }} />)
    expect(screen.getByText('暂无任务')).toBeInTheDocument()
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
