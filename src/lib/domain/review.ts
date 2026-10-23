import type { Detection } from './schemas'

// §10.5: high ≥ 0.8, medium 0.5–0.8, low < 0.5. Low-confidence findings must be
// human-reviewed before a report can be exported or regenerated.
export const LOW_CONFIDENCE = 0.5

type Reviewable = Pick<Detection, 'reviewStatus' | 'confidence'>

export function isPendingLowConfidence(detection: Reviewable): boolean {
  return detection.reviewStatus === 'pending' && detection.confidence < LOW_CONFIDENCE
}

export function pendingLowConfidenceCount(detections: Reviewable[]): number {
  return detections.filter(isPendingLowConfidence).length
}

export function hasPendingLowConfidence(detections: Reviewable[]): boolean {
  return detections.some(isPendingLowConfidence)
}
