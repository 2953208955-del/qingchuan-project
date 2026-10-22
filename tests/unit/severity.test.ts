import { describe, it, expect } from 'vitest'
import { computeSeverity, SEVERITY_FORMULA_VERSION } from '@/lib/domain/severity'
import type { Detection } from '@/lib/domain/schemas'

function det(category: Detection['category'], confidence = 0.9, reviewStatus: Detection['reviewStatus'] = 'confirmed', imageId = 'i1'): Detection {
  return { id: Math.random().toString(36).slice(2), imageId, category, material: null, confidence, bbox: null, description: '', source: 'vlm', reviewStatus }
}

describe('computeSeverity', () => {
  it('returns low for an empty image', () => {
    const r = computeSeverity([], 1)
    expect(r.overall).toBe('low')
    expect(r.intensity).toBe(0)
    expect(r.formulaVersion).toBe(SEVERITY_FORMULA_VERSION)
  })

  it('medium at 3 plastic bottles per image (3.6 weighted)', () => {
    const r = computeSeverity([det('plastic_bottle'), det('plastic_bottle'), det('plastic_bottle')], 1)
    expect(r.weightedTotal).toBeCloseTo(3.6)
    expect(r.overall).toBe('medium')
  })

  it('high when intensity >= 5', () => {
    const r = computeSeverity([det('fishing_gear'), det('fishing_gear'), det('fishing_gear'), det('fishing_gear')], 1)
    expect(r.intensity).toBeCloseTo(6)
    expect(r.overall).toBe('high')
  })

  it('treats an exact 5.0 intensity as high despite floating-point accumulation', () => {
    // 3 * 1.5 + 5 * 1.1 = 10 exactly; accumulated as binary floats this order
    // yields 9.999999999999998, i.e. intensity 4.999999999999999 at imageCount 2.
    const detections = [
      ...Array.from({ length: 3 }, () => det('fishing_gear')),
      ...Array.from({ length: 5 }, () => det('glass')),
    ]
    const r = computeSeverity(detections, 2)
    expect(r.weightedTotal).toBeCloseTo(10)
    expect(r.intensity).toBe(5)
    expect(r.overall).toBe('high')
  })

  it('treats an exact 2.0 intensity as medium despite floating-point accumulation', () => {
    // Hazard-free ordering of 5 * 1.2 + 4 * 1.0 = 10 exactly; accumulated in
    // this order it yields 9.999999999999998, i.e. intensity 1.9999999999999998.
    const categories: Detection['category'][] = [
      'plastic_bottle', 'plastic_bottle', 'paper', 'plastic_bottle', 'paper',
      'paper', 'paper', 'plastic_bottle', 'plastic_bottle',
    ]
    const r = computeSeverity(categories.map(c => det(c)), 5)
    expect(r.weightedTotal).toBeCloseTo(10)
    expect(r.intensity).toBe(2)
    expect(r.overall).toBe('medium')
  })

  it('excludes natural debris and rejected detections', () => {
    const r = computeSeverity([det('natural'), det('plastic_bag', 0.9, 'rejected')], 1)
    expect(r.weightedTotal).toBe(0)
  })

  it('upgrades low to medium on hazardous category', () => {
    const r = computeSeverity([det('glass')], 1)
    expect(r.overall).toBe('medium')
  })

  it('upgrades low to medium when one category reaches 10 items', () => {
    const detections = Array.from({ length: 10 }, () => det('paper'))
    const r = computeSeverity(detections, 10)
    expect(r.intensity).toBeCloseTo(1)
    expect(r.overall).toBe('medium')
  })

  it('throws for invalid image count', () => {
    expect(() => computeSeverity([], 0)).toThrow(/imageCount/)
  })
})
