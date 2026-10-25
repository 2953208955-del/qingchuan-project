'use client'

import { useState } from 'react'
import { LOW_CONFIDENCE } from '@/lib/domain/review'
import { CATEGORY_LABELS } from '@/lib/domain/schemas'
import type { DebrisCategory, Detection } from '@/lib/domain/schemas'

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [DebrisCategory, string][]

// Low-confidence detections start as `pending`, and any review decision removes
// them from the queue. Only pending rows are actionable here: confirmed /
// corrected / rejected findings must not be reviewed twice.
export function ReviewQueue({
  runId,
  detections,
  onChanged,
}: {
  runId: string
  detections: Detection[]
  onChanged: () => void
}) {
  // A set (not a single id) so reviewing two rows concurrently cannot re-enable
  // a row whose request is still in flight.
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<string, DebrisCategory | ''>>({})
  const pending = detections.filter(detection => detection.reviewStatus === 'pending')

  async function update(detection: Detection, reviewStatus: 'confirmed' | 'rejected' | 'corrected', category?: DebrisCategory) {
    setBusyIds(previous => new Set(previous).add(detection.id))
    setError(null)
    try {
      const body: Record<string, string> = {
        reviewStatus,
        runId,
        imageId: detection.imageId,
      }
      if (reviewStatus === 'corrected' && category) {
        body.category = category
        body.hint = `人工改为${CATEGORY_LABELS[category]}`
      }
      const res = await fetch(`/api/detections/${detection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { message?: unknown } | null
        throw new Error(
          typeof payload?.message === 'string' && payload.message
            ? payload.message
            : `复核失败（${res.status}）`,
        )
      }
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusyIds(previous => {
        const next = new Set(previous)
        next.delete(detection.id)
        return next
      })
    }
  }

  return (
    <section aria-label="复核队列" className="space-y-2">
      <h2 className="review-heading" aria-live="polite">
        需复核 {pending.length} 项
      </h2>
      {error && (
        <p role="alert" className="inspect-alert">
          {error}
        </p>
      )}
      {pending.length === 0 && (
        <p className="inspect-meta">暂无待复核项。</p>
      )}
      {pending.map(detection => {
        const label = CATEGORY_LABELS[detection.category]
        const busy = busyIds.has(detection.id)
        const correction = corrections[detection.id] ?? ''
        return (
          <div
            key={detection.id}
            data-review-id={detection.id}
            role="group"
            aria-label={`${label}复核项`}
            className="review-card"
          >
            <div className="review-card__head">
              <span className="review-card__label">
                {label}
                {detection.confidence < LOW_CONFIDENCE && (
                  <span className="holo-badge holo-badge--magenta">低置信度</span>
                )}
              </span>
              <span className="review-card__confidence">{Math.round(detection.confidence * 100)}%</span>
            </div>
            <div className="review-card__actions">
              <button
                type="button"
                disabled={busy}
                onClick={() => update(detection, 'confirmed')}
                className="holo-btn"
              >
                确认
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => update(detection, 'rejected')}
                className="holo-btn holo-btn--ghost"
              >
                删除
              </button>
              <select
                aria-label="纠正类别"
                value={correction}
                disabled={busy}
                onChange={event => setCorrections(prev => ({
                  ...prev,
                  [detection.id]: event.target.value as DebrisCategory | '',
                }))}
                className="holo-input"
              >
                <option value="">纠正类别</option>
                {CATEGORY_OPTIONS.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || correction === ''}
                onClick={() => correction !== '' && update(detection, 'corrected', correction)}
                className="holo-btn"
              >
                纠错
              </button>
            </div>
          </div>
        )
      })}
    </section>
  )
}
