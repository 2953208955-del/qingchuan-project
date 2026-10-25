import { describe, expect, it } from 'vitest'
import { buildCategoryMix, buildConfidenceBins, groupCategoryMix } from '@/lib/dashboard/chart-data'
import type { DashboardDetection } from '@/lib/dashboard/types'

function det(category: DashboardDetection['category'], confidence = 0.9): DashboardDetection {
  return {
    id: `${category}-${confidence}`, imageId: 'i', category, material: null,
    confidence, bbox: null, description: '', source: 'vlm',
    reviewStatus: 'confirmed', createdAt: 1,
  }
}

describe('dashboard chart data', () => {
  it('keeps natural in the category mix with its own label', () => {
    const mix = buildCategoryMix([det('plastic_bottle'), det('plastic_bottle'), det('natural')])
    expect(mix).toEqual([
      { category: 'plastic_bottle', label: '塑料瓶', count: 2 },
      { category: 'natural', label: '自然漂浮物', count: 1 },
    ])
  })

  it('bins confidence into five half-open bands, with 1.0 in the last band', () => {
    const bins = buildConfidenceBins([
      det('plastic_bottle', 0.1), det('plastic_bottle', 0.2), det('plastic_bottle', 0.42),
      det('plastic_bottle', 0.5), det('plastic_bottle', 0.79), det('plastic_bottle', 0.8),
      det('plastic_bottle', 0.95), det('plastic_bottle', 1),
    ])
    expect(bins.map(b => b.count)).toEqual([1, 1, 2, 1, 3])
  })

  it('groups everything after the top four into 其余类别', () => {
    const mix = buildCategoryMix([
      ...Array.from({ length: 10 }, () => det('plastic_bottle')),
      ...Array.from({ length: 8 }, () => det('plastic_bag')),
      ...Array.from({ length: 6 }, () => det('fishing_gear')),
      ...Array.from({ length: 4 }, () => det('foam')),
      ...Array.from({ length: 2 }, () => det('metal')),
      ...Array.from({ length: 1 }, () => det('paper')),
    ])
    expect(groupCategoryMix(mix, 5)).toEqual([
      { key: 'plastic_bottle', label: '塑料瓶', count: 10 },
      { key: 'plastic_bag', label: '塑料袋', count: 8 },
      { key: 'fishing_gear', label: '渔网渔具', count: 6 },
      { key: 'foam', label: '泡沫塑料', count: 4 },
      { key: 'rest', label: '其余类别', count: 3 },
    ])
  })
})
