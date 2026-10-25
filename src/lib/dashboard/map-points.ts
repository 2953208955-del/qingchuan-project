import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type { DashboardDetection, MapPoint } from './types'

export type { MapPoint } from './types'

export const MAP_POINT_LIMIT = 24

// Percentage coordinates tracing the river from top-left downstream, then
// folding back along the upper bank. Kept as data so rendering stays pure.
export const MAP_ANCHORS = [
  { x: 12, y: 62 }, { x: 18, y: 57 }, { x: 23, y: 64 }, { x: 28, y: 55 },
  { x: 34, y: 60 }, { x: 39, y: 50 }, { x: 44, y: 56 }, { x: 50, y: 46 },
  { x: 55, y: 52 }, { x: 60, y: 42 }, { x: 65, y: 48 }, { x: 70, y: 38 },
  { x: 74, y: 45 }, { x: 78, y: 35 }, { x: 82, y: 41 }, { x: 86, y: 31 },
  { x: 90, y: 37 }, { x: 93, y: 27 }, { x: 87, y: 22 }, { x: 80, y: 25 },
  { x: 73, y: 28 }, { x: 66, y: 23 }, { x: 58, y: 29 }, { x: 50, y: 33 },
] as const

function compareIds(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function byConfidenceDesc(a: DashboardDetection, b: DashboardDetection): number {
  return (
    b.confidence - a.confidence ||
    a.createdAt - b.createdAt ||
    compareIds(a.id, b.id)
  )
}

function byCreatedAtAsc(a: DashboardDetection, b: DashboardDetection): number {
  return a.createdAt - b.createdAt || compareIds(a.id, b.id)
}

function severityOf(
  detection: DashboardDetection,
): MapPoint['severity'] {
  if (detection.reviewStatus === 'pending' && detection.confidence < 0.5) return 'review'
  if (detection.category === 'natural') return 'natural'
  return 'normal'
}

export function buildMapPoints(
  detections: DashboardDetection[],
): { points: MapPoint[]; hiddenCount: number } {
  const selected = [...detections].sort(byConfidenceDesc).slice(0, MAP_POINT_LIMIT)
  selected.sort(byCreatedAtAsc)

  const points = selected.map((detection, index) => {
    const anchor = MAP_ANCHORS[index]
    return {
      id: detection.id,
      detectionId: detection.id,
      imageId: detection.imageId,
      category: detection.category,
      label: CATEGORY_LABELS[detection.category],
      confidence: detection.confidence,
      reviewStatus: detection.reviewStatus,
      severity: severityOf(detection),
      x: anchor.x,
      y: anchor.y,
    }
  })

  return {
    points,
    hiddenCount: Math.max(0, detections.length - MAP_POINT_LIMIT),
  }
}
