import { describe, expect, it } from 'vitest'
import { MAP_ANCHORS, MAP_POINT_LIMIT, buildMapPoints } from '@/lib/dashboard/map-points'
import type { DashboardDetection } from '@/lib/dashboard/types'

function det(id: string, overrides: Partial<DashboardDetection> = {}): DashboardDetection {
  return {
    id, imageId: 'img-1', category: 'plastic_bottle', material: null,
    confidence: 0.9, bbox: null, description: '', source: 'vlm',
    reviewStatus: 'confirmed', createdAt: 1, ...overrides,
  }
}

describe('buildMapPoints', () => {
  it('places every detection deterministically and marks review/natural severity', () => {
    const result = buildMapPoints([
      det('low', { confidence: 0.42, reviewStatus: 'pending', createdAt: 3 }),
      det('natural', { category: 'natural', createdAt: 2 }),
      det('normal', { createdAt: 1 }),
    ])
    expect(result.hiddenCount).toBe(0)
    expect(result.points.map(p => p.id)).toEqual(['normal', 'natural', 'low'])
    expect(result.points.find(p => p.id === 'low')?.severity).toBe('review')
    expect(result.points.find(p => p.id === 'natural')?.severity).toBe('natural')
    expect(result.points.find(p => p.id === 'normal')?.severity).toBe('normal')
    for (const point of result.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(100)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(100)
    }
  })

  it('caps at 24 by confidence and reports the hidden count', () => {
    const input = Array.from({ length: 30 }, (_, i) =>
      det(`d-${i}`, { confidence: (i + 1) / 30, createdAt: i + 1 }),
    )
    const result = buildMapPoints(input)
    expect(result.points).toHaveLength(MAP_POINT_LIMIT)
    expect(result.hiddenCount).toBe(6)
    expect(result.points.some(p => p.id === 'd-0')).toBe(false)
    expect(result.points.some(p => p.id === 'd-29')).toBe(true)
  })

  it('has 24 unique anchors', () => {
    expect(MAP_ANCHORS).toHaveLength(24)
    expect(new Set(MAP_ANCHORS.map(a => `${a.x},${a.y}`)).size).toBe(24)
  })
})
