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

// All category weights are multiples of 0.1. Accumulate them as integer tenths
// so exact thresholds (2.0, 5.0) cannot be misclassified by binary
// floating-point error (e.g. 3 * 1.5 + 5 * 1.1 sums to 9.999999999999998).
const WEIGHT_TENTHS = 10
const toTenths = (weight: number) => Math.round(weight * WEIGHT_TENTHS)

export function computeSeverity(detections: Detection[], imageCount: number): SeverityResult {
  if (!Number.isInteger(imageCount) || imageCount <= 0) {
    throw new Error('imageCount must be a positive integer')
  }
  const active = detections.filter(d => d.reviewStatus !== 'rejected' && d.category !== 'natural')
  const perImageTenths = new Map<string, number>()
  const categoryCount = new Map<DebrisCategory, number>()
  let weightedTotalTenths = 0

  for (const d of active) {
    const tenths = toTenths(CATEGORY_WEIGHTS[d.category])
    weightedTotalTenths += tenths
    perImageTenths.set(d.imageId, (perImageTenths.get(d.imageId) ?? 0) + tenths)
    categoryCount.set(d.category, (categoryCount.get(d.category) ?? 0) + 1)
  }

  // intensity = weightedTotalTenths / 10 / imageCount. Cross-multiply the
  // threshold comparison so it stays exact in integer arithmetic.
  const intensity = weightedTotalTenths / (WEIGHT_TENTHS * imageCount)
  let overall: Severity =
    weightedTotalTenths < 2 * WEIGHT_TENTHS * imageCount ? 'low'
      : weightedTotalTenths < 5 * WEIGHT_TENTHS * imageCount ? 'medium'
      : 'high'

  const hasHazard = active.some(d => HAZARD_CATEGORIES.includes(d.category))
  const hasLargeCategory = [...categoryCount.values()].some(n => n >= 10)
  if ((hasHazard || hasLargeCategory) && overall === 'low') overall = 'medium'

  return {
    perImage: [...perImageTenths.entries()].map(([imageId, tenths]) => ({ imageId, weighted: round2(tenths / WEIGHT_TENTHS) })),
    overall,
    weightedTotal: round2(weightedTotalTenths / WEIGHT_TENTHS),
    intensity: round2(intensity),
    formulaVersion: SEVERITY_FORMULA_VERSION,
  }
}
