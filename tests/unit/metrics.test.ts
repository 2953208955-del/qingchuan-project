import { describe, it, expect } from 'vitest'
import { computeIou, matchDetections, type DetectionLike } from '@/lib/eval/metrics'
import type { BBox, Detection } from '@/lib/domain/schemas'

function det(
  id: string,
  imageId: string,
  category: Detection['category'],
  bbox: BBox | null,
): DetectionLike {
  return { id, imageId, category, bbox }
}

describe('computeIou', () => {
  it('is 1 for identical boxes and 0 for disjoint boxes', () => {
    expect(computeIou({ x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })).toBeCloseTo(1)
    expect(computeIou({ x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 1, w: 1, h: 1 })).toBeCloseTo(0)
  })

  it('computes a partial overlap', () => {
    // intersection 0.25 * 0.25 = 0.0625; union 0.25 + 0.25 - 0.0625 = 0.4375
    expect(
      computeIou(
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
      ),
    ).toBeCloseTo(1 / 7)
  })

  it('returns 0 for degenerate zero-area boxes', () => {
    expect(computeIou({ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 })).toBe(0)
  })
})

describe('matchDetections', () => {
  it('matches detections at IoU >= 0.5', () => {
    const gt = [det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    const pred = [det('p1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 1, fp: 0, fn: 0 })
  })

  it('counts unmatched predictions as fp and unmatched ground truth as fn', () => {
    const gt = [
      det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
      det('g2', 'i1', 'plastic_bag', { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }),
    ]
    const pred = [
      det('p1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
      det('p2', 'i1', 'plastic_bag', { x: 0, y: 0.5, w: 0.5, h: 0.5 }),
    ]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 1, fp: 1, fn: 1 })
  })

  it('does not match across categories even when the boxes overlap exactly', () => {
    const gt = [det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    const pred = [det('p1', 'i1', 'glass', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 0, fp: 1, fn: 1 })
  })

  it('does not match across images even when category and boxes agree', () => {
    const gt = [det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    const pred = [det('p1', 'i2', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 0, fp: 1, fn: 1 })
  })

  it('chooses the highest-IoU unused prediction when several overlap', () => {
    // g1 overlaps both (pHi = 1.0, pLo = 0.818) and must take pHi, otherwise g2
    // (only overlapping pLo at 0.538) would be left unmatched.
    const gt = [
      det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
      det('g2', 'i1', 'plastic_bottle', { x: 0.2, y: 0, w: 0.5, h: 0.5 }),
    ]
    const pHi = det('pHi', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })
    const pLo = det('pLo', 'i1', 'plastic_bottle', { x: 0.05, y: 0, w: 0.5, h: 0.5 })
    expect(matchDetections(gt, [pLo, pHi], 0.5)).toEqual({ tp: 2, fp: 0, fn: 0 })
  })

  it('never reuses one prediction for two ground-truth boxes', () => {
    const gt = [
      det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
      det('g2', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
    ]
    const pred = [det('p1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 1, fp: 0, fn: 1 })
  })

  it('ignores ground truth without a bbox instead of counting it as fn', () => {
    const gt = [
      det('g1', 'i1', 'plastic_bottle', null),
      det('g2', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
    ]
    expect(matchDetections(gt, [], 0.5)).toEqual({ tp: 0, fp: 0, fn: 1 })
    expect(matchDetections(gt, [det('p1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })], 0.5)).toEqual({ tp: 1, fp: 0, fn: 0 })
  })

  it('counts predictions without a bbox as fp', () => {
    const gt = [det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 })]
    const pred = [
      det('p1', 'i1', 'plastic_bottle', null),
      det('p2', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 0.5, h: 0.5 }),
    ]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 1, fp: 1, fn: 0 })
  })

  it('treats an IoU exactly at the threshold as a match', () => {
    const gt = [det('g1', 'i1', 'plastic_bottle', { x: 0, y: 0, w: 1, h: 0.5 })]
    const pred = [det('p1', 'i1', 'plastic_bottle', { x: 0.5, y: 0, w: 0.5, h: 0.5 })]
    expect(matchDetections(gt, pred, 0.5)).toEqual({ tp: 1, fp: 0, fn: 0 })
  })
})
