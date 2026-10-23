import { BBox, Detection, UploadedImage } from './schemas'

// Shared parsers for the `GET /api/runs/[id]` payload. The DB stores images as
// plain rows and detections with `bboxJson`, while the UI components consume the
// domain types; malformed rows are dropped instead of crashing a page.

export function parseImages(value: unknown): UploadedImage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = UploadedImage.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export function parseDetections(value: unknown): Detection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const row = item as Record<string, unknown>
    let bbox: BBox | null = null
    if (typeof row.bboxJson === 'string' && row.bboxJson.length > 0) {
      try {
        const parsed = BBox.safeParse(JSON.parse(row.bboxJson))
        if (parsed.success) bbox = parsed.data
      } catch {
        // Keep the detection; only the overlay is missing.
      }
    }
    const parsed = Detection.safeParse({ ...row, bbox })
    return parsed.success ? [parsed.data] : []
  })
}
