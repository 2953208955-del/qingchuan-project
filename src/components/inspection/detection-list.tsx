'use client'

import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type { Detection } from '@/lib/domain/schemas'
import { useInspectionStore } from '@/stores/inspection-store'

export function DetectionList({ detections }: { detections: Detection[] }) {
  const selectedDetectionId = useInspectionStore(s => s.selectedDetectionId)
  const setSelectedDetection = useInspectionStore(s => s.setSelectedDetection)

  return (
    <section aria-label="识别结果" className="space-y-2">
      {detections.length === 0 && <p className="inspect-meta">暂无识别结果。</p>}
      <ul className="space-y-1.5">
        {detections.map(detection => (
          <li key={detection.id}>
            <button
              type="button"
              onClick={() => setSelectedDetection(detection.id)}
              aria-pressed={selectedDetectionId === detection.id}
              className="detection-row"
            >
              <span>{CATEGORY_LABELS[detection.category]}</span>
              <span className="detection-row__meta">{Math.round(detection.confidence * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
