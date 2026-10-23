import type { BBox, Detection } from '@/lib/domain/schemas'

export type DetectionLike = Pick<Detection, 'id' | 'imageId' | 'category' | 'bbox'>

export function computeIou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union <= 0 ? 0 : inter / union
}

// Each ground-truth box claims the unused prediction with the highest IoU among
// predictions of the same image and category at or above the threshold. A
// prediction is used at most once. Ground truth without a bbox cannot be
// localized and is ignored (not an fn); predictions without a bbox can never
// match and therefore count as fp.
export function matchDetections(
  gt: DetectionLike[],
  pred: DetectionLike[],
  iouThreshold: number,
): { tp: number; fp: number; fn: number } {
  let tp = 0
  const used = new Set<number>()

  for (const g of gt) {
    const gtBbox = g.bbox
    if (gtBbox == null) continue

    let bestIndex = -1
    let bestIou = -Infinity
    for (let i = 0; i < pred.length; i++) {
      if (used.has(i)) continue
      const p = pred[i]
      if (p.bbox == null || p.imageId !== g.imageId || p.category !== g.category) continue
      const iou = computeIou(gtBbox, p.bbox)
      if (iou >= iouThreshold && iou > bestIou) {
        bestIou = iou
        bestIndex = i
      }
    }

    if (bestIndex >= 0) {
      used.add(bestIndex)
      tp++
    }
  }

  const localizedGt = gt.filter(g => g.bbox != null).length
  return { tp, fp: pred.length - tp, fn: localizedGt - tp }
}
