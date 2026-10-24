'use client'

import { useState } from 'react'
import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type { Detection, UploadedImage } from '@/lib/domain/schemas'
import { useInspectionStore } from '@/stores/inspection-store'

// Shows one analyzed image at a time. The active image follows the selected
// detection so clicking a finding in the list (or a report evidence link) always
// brings its photo into view; the thumbnail row switches manually and clears
// the selection so the two controls never fight each other.
export function EvidenceCanvas({ images, detections, highlightDetectionIds = [] }: {
  images: UploadedImage[]
  detections: Detection[]
  // All detections cited by the selected report claim; the single selected
  // detection is already highlighted via the store.
  highlightDetectionIds?: string[]
}) {
  const selectedDetectionId = useInspectionStore(s => s.selectedDetectionId)
  const setSelectedDetection = useInspectionStore(s => s.setSelectedDetection)
  const [manualImageId, setManualImageId] = useState<string | null>(null)
  const highlighted = new Set(highlightDetectionIds)

  const analyzed = images.filter(image => image.status === 'analyzed')
  if (analyzed.length === 0) {
    return (
      <section aria-label="证据画布" className="rounded-xl border border-dashed border-border p-6">
        <p className="text-sm text-muted-foreground">暂无可展示的巡检图片。分析完成后将在此显示识别框。</p>
      </section>
    )
  }

  const selectedDetection = detections.find(detection => detection.id === selectedDetectionId) ?? null
  const active =
    analyzed.find(image => image.id === selectedDetection?.imageId) ??
    analyzed.find(image => image.id === manualImageId) ??
    analyzed[0]
  const visible = detections.filter(detection => detection.imageId === active.id)

  function switchImage(imageId: string) {
    setManualImageId(imageId)
    setSelectedDetection(null)
  }

  return (
    <section aria-label="证据画布" className="space-y-2">
      {analyzed.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="切换巡检图片">
          {analyzed.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => switchImage(image.id)}
              aria-pressed={active.id === image.id}
              aria-label={`查看图片 ${image.filename}`}
              className={`max-w-48 truncate rounded border px-2 py-1 text-xs ${
                active.id === image.id
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {index + 1}. {image.filename}
            </button>
          ))}
        </div>
      )}

      <div className="relative overflow-hidden rounded-xl border border-border">
        <img
          src={`/api/images/${active.id}`}
          alt={`巡检原图 ${active.filename}`}
          data-image-id={active.id}
          className="block w-full"
        />
        {visible.map(detection => detection.bbox && (
          <button
            key={detection.id}
            type="button"
            aria-label={`识别框 ${CATEGORY_LABELS[detection.category]}`}
            aria-pressed={selectedDetectionId === detection.id}
            data-detection-id={detection.id}
            data-highlighted={highlighted.has(detection.id) ? 'true' : undefined}
            onClick={() => setSelectedDetection(detection.id)}
            className={`absolute border-2 ${
              selectedDetectionId === detection.id || highlighted.has(detection.id)
                ? 'border-accent bg-accent/20'
                : 'border-primary/70 hover:border-accent'
            }`}
            style={{
              left: `${detection.bbox.x * 100}%`,
              top: `${detection.bbox.y * 100}%`,
              width: `${detection.bbox.w * 100}%`,
              height: `${detection.bbox.h * 100}%`,
            }}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground">该图片未识别到垃圾目标。</p>
      )}
    </section>
  )
}
