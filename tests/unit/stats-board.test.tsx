// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { StatsBoard } from '@/components/dashboard/stats-board'
import type { DashboardStats } from '@/lib/dashboard/types'

afterEach(cleanup)

const stats: DashboardStats = {
  totalRuns: 5,
  totalDetections: 40,
  pendingLowConfidence: 2,
  averageConfidence: 0.86,
  reportCount: 4,
  clauseCount: 6,
  categoryMix: [
    { category: 'plastic_bottle', label: '塑料瓶', count: 24 },
    { category: 'plastic_bag', label: '塑料袋', count: 7 },
    { category: 'fishing_gear', label: '渔网渔具', count: 4 },
    { category: 'other', label: '其他', count: 3 },
    { category: 'natural', label: '自然漂浮物', count: 2 },
    { category: 'metal', label: '金属', count: 1 },
  ],
  confidenceBins: [
    { label: '0–20%', min: 0, max: 0.2, count: 0 },
    { label: '20–40%', min: 0.2, max: 0.4, count: 1 },
    { label: '40–60%', min: 0.4, max: 0.6, count: 2 },
    { label: '60–80%', min: 0.6, max: 0.8, count: 8 },
    { label: '80–100%', min: 0.8, max: 1, count: 29 },
  ],
}

describe('StatsBoard', () => {
  it('renders the four KPI values from the server stats', () => {
    render(<StatsBoard stats={stats} />)
    expect(document.querySelector('[data-kpi="detections"]')).toHaveTextContent('40')
    expect(document.querySelector('[data-kpi="pending"]')).toHaveTextContent('2')
    expect(document.querySelector('[data-kpi="confidence"]')).toHaveTextContent('86%')
    expect(document.querySelector('[data-kpi="runs"]')).toHaveTextContent('5')
  })

  it('lists grouped slices and keeps the full category counts available', () => {
    render(<StatsBoard stats={stats} />)
    expect(screen.getAllByText('塑料瓶').length).toBeGreaterThan(0)
    expect(screen.getByText('其余类别')).toBeInTheDocument()
    expect(screen.getByText(/金属 1/)).toBeInTheDocument()
  })

  it('renders the confidence bins as a line summary', () => {
    render(<StatsBoard stats={stats} />)
    expect(screen.getByText('80–100%')).toBeInTheDocument()
    expect(screen.getByText(/29 个/)).toBeInTheDocument()
  })

  it('keeps KPI labels out of the accessibility tree so they are announced once', () => {
    render(<StatsBoard stats={stats} />)
    const visibleLabel = screen.getByText('累计识别', { selector: '.stats-kpi__label' })
    expect(visibleLabel).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText('累计识别：40')).toBeInTheDocument()
  })
})
