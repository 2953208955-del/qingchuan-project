import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type {
  CategoryCount,
  CategorySlice,
  ConfidenceBin,
  DashboardDetection,
} from './types'

export type { CategorySlice } from './types'

const BIN_EDGES = [0, 0.2, 0.4, 0.6, 0.8] as const
const BIN_LABELS = ['0–20%', '20–40%', '40–60%', '60–80%', '80–100%'] as const

function compareIds(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

export function buildCategoryMix(detections: DashboardDetection[]): CategoryCount[] {
  const counts = new Map<DashboardDetection['category'], number>()
  for (const detection of detections) {
    counts.set(detection.category, (counts.get(detection.category) ?? 0) + 1)
  }

  return Array.from(counts, ([category, count]) => ({
    category,
    label: CATEGORY_LABELS[category],
    count,
  })).sort((a, b) => b.count - a.count || compareIds(a.label, b.label))
}

export function buildConfidenceBins(detections: DashboardDetection[]): ConfidenceBin[] {
  const counts = BIN_LABELS.map(() => 0)
  for (const detection of detections) {
    const index = Math.min(4, Math.max(0, Math.floor(detection.confidence * 5)))
    counts[index] += 1
  }

  return BIN_LABELS.map((label, index) => ({
    label,
    min: BIN_EDGES[index],
    max: index === BIN_LABELS.length - 1 ? 1 : BIN_EDGES[index + 1],
    count: counts[index],
  }))
}

export function groupCategoryMix(mix: CategoryCount[], maxSlices = 5): CategorySlice[] {
  if (mix.length <= maxSlices) {
    return mix.map(item => ({ key: item.category, label: item.label, count: item.count }))
  }

  const head = mix
    .slice(0, Math.max(0, maxSlices - 1))
    .map(item => ({ key: item.category, label: item.label, count: item.count }))
  const restCount = mix
    .slice(Math.max(0, maxSlices - 1))
    .reduce((sum, item) => sum + item.count, 0)

  return [...head, { key: 'rest', label: '其余类别', count: restCount }]
}
