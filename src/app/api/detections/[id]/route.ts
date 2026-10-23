import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { detections, feedback } from '@/lib/db/schema'
import { markReportStale, updateDetection } from '@/lib/db/repo'
import { DebrisCategory } from '@/lib/domain/schemas'

export const runtime = 'nodejs'

const REVIEW_STATUSES = new Set(['pending', 'confirmed', 'rejected', 'corrected'])
const CATEGORY_VALUES = new Set<string>(DebrisCategory.options)

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json() as {
    reviewStatus?: string; category?: string; hint?: string
    runId?: string; imageId?: string
  }
  const db = getDb()
  const detection = db.select().from(detections).where(eq(detections.id, id)).get()
  if (!detection) {
    return NextResponse.json({ code: 'NOT_FOUND', message: '识别结果不存在', retryable: false }, { status: 404 })
  }
  if (body.reviewStatus !== undefined && !REVIEW_STATUSES.has(body.reviewStatus)) {
    return NextResponse.json({ code: 'INVALID_INPUT', message: '复核状态不合法', retryable: false }, { status: 400 })
  }
  if (body.category !== undefined && !CATEGORY_VALUES.has(body.category)) {
    return NextResponse.json({ code: 'INVALID_INPUT', message: '类别不合法', retryable: false }, { status: 400 })
  }

  // Only touch fields the client actually sent; drizzle would otherwise write
  // undefined values into the row.
  const patch: { reviewStatus?: string; category?: string } = {}
  if (body.reviewStatus !== undefined) patch.reviewStatus = body.reviewStatus
  if (body.category !== undefined) patch.category = body.category
  if (Object.keys(patch).length > 0) updateDetection(db, id, patch)

  if (body.hint) {
    // Feedback always belongs to the detection's own run/image, whatever the
    // client put in the body.
    db.insert(feedback).values({
      id: crypto.randomUUID(), runId: detection.runId, imageId: detection.imageId,
      correctionJson: JSON.stringify({ detectionId: id, hint: body.hint }),
      createdAt: Date.now(),
    }).run()
  }
  // A mismatched runId must not let one run's review invalidate another's report.
  if (body.runId === detection.runId) markReportStale(db, detection.runId)
  return NextResponse.json({ ok: true })
}
