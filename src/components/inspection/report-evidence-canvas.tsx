'use client'

import type { Detection, ReportClaim, UploadedImage } from '@/lib/domain/schemas'
import { useInspectionStore } from '@/stores/inspection-store'
import { EvidenceCanvas } from './evidence-canvas'

// Report-page bridge between the shared selection store and the workbench's
// EvidenceCanvas. Selecting a claim highlights every detection it cites (across
// images), without inventing a second interaction model.
export function ReportEvidenceCanvas({ images, detections, claims }: {
  images: UploadedImage[]
  detections: Detection[]
  claims: ReportClaim[]
}) {
  const selectedClaimId = useInspectionStore(s => s.selectedClaimId)
  const claim = claims.find(item => item.id === selectedClaimId) ?? null
  const highlightDetectionIds = claim
    ? claim.evidenceIds
      .filter(id => id.startsWith('detection:'))
      .map(id => id.slice('detection:'.length))
    : []

  return (
    <EvidenceCanvas
      images={images}
      detections={detections}
      highlightDetectionIds={highlightDetectionIds}
    />
  )
}
