import type { DebrisCategory, Detection, Severity } from './schemas'

export const SEVERITY_FORMULA_VERSION = 'severity-v1'

export const CATEGORY_WEIGHTS: Record<DebrisCategory, number> = {
  fishing_gear: 1.5,
  plastic_bottle: 1.2,
  plastic_bag: 1.2,
  foam: 1.2,
  glass: 1.1,
  metal: 1.1,
  paper: 1.0,
  textile: 1.0,
  other: 1.0,
  natural: 0,
}

export const HAZARD_CATEGORIES: DebrisCategory[] = ['fishing_gear', 'glass', 'metal']

export interface SeverityResult {
  perImage: { imageId: string; weighted: number }[]
  overall: Severity
  weightedTotal: number
  intensity: number
  formulaVersion: string
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeSeverity(detections: Detection[], imageCount: number): SeverityResult {
  if (!Number.isInteger(imageCount) || imageCount <= 0) {
    throw new Error('imageCount must be a positive integer')
  }
  const active = detections.filter(d => d.reviewStatus !== 'rejected' && d.category !== 'natural')
  const perImageMap = new Map<string, number>()
  const categoryCount = new Map<DebrisCategory, number>()
  let weightedTotal = 0

  for (const d of active) {
    const w = CATEGORY_WEIGHTS[d.category]
    weightedTotal += w
    perImageMap.set(d.imageId, (perImageMap.get(d.imageId) ?? 0) + w)
    categoryCount.set(d.category, (categoryCount.get(d.category) ?? 0) + 1)
  }

  const intensity = weightedTotal / imageCount
  let overall: Severity = intensity < 2 ? 'low' : intensity < 5 ? 'medium' : 'high'

  const hasHazard = active.some(d => HAZARD_CATEGORIES.includes(d.category))
  const hasLargeCategory = [...categoryCount.values()].some(n => n >= 10)
  if ((hasHazard || hasLargeCategory) && overall === 'low') overall = 'medium'

  return {
    perImage: [...perImageMap.entries()].map(([imageId, weighted]) => ({ imageId, weighted: round2(weighted) })),
    overall,
    weightedTotal: round2(weightedTotal),
    intensity: round2(intensity),
    formulaVersion: SEVERITY_FORMULA_VERSION,
  }
}
