'use client'

import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type { Detection } from '@/lib/domain/schemas'
import { useInspectionStore } from '@/stores/inspection-store'

export function DetectionList({ detections }: { detections: Detection[] }) {
  const selectedDetectionId = useInspectionStore(s => s.selectedDetectionId)
  const setSelectedDetection = useInspectionStore(s => s.setSelectedDetection)

  return (
    <section aria-label="识别结果" className="space-y-2">
      <h2 className="text-sm font-medium">识别结果</h2>
      {detections.length === 0 && <p className="text-sm text-muted-foreground">暂无识别结果。</p>}
      <ul className="space-y-1 text-sm">
        {detections.map(detection => (
          <li key={detection.id}>
            <button
              type="button"
              onClick={() => setSelectedDetection(detection.id)}
              aria-pressed={selectedDetectionId === detection.id}
              className={`flex w-full items-center justify-between rounded px-2 py-1 text-left ${
                selectedDetectionId === detection.id ? 'bg-accent/20' : 'hover:bg-muted'
              }`}
            >
              <span>{CATEGORY_LABELS[detection.category]}</span>
              <span className="text-xs text-muted-foreground">{Math.round(detection.confidence * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
