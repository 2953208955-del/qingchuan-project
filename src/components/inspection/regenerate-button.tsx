'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// The only way out of `awaiting_review`/`stale` once every low-confidence
// finding has been reviewed. The server re-runs the shared report pipeline from
// the persisted detections and a successful refresh shows the new draft.
export function RegenerateButton({ runId, pendingCount }: { runId: string; pendingCount: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function regenerate() {
    if (pendingCount > 0 || busy) return
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const res = await fetch(`/api/runs/${runId}/report`, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: unknown } | null
        throw new Error(
          typeof body?.message === 'string' && body.message
            ? body.message
            : `重新生成失败（${res.status}）`,
        )
      }
      setDone(true)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (pendingCount > 0) {
    return (
      <div className="report-regenerate">
        <button
          type="button"
          disabled
          className="holo-btn"
        >
          还需复核 {pendingCount} 项
        </button>
        <p className="report-hint">复核完所有低置信结果后才能重新生成报告。</p>
      </div>
    )
  }

  return (
    <div className="report-regenerate">
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        className="holo-btn holo-btn--primary"
      >
        {busy ? '正在重新生成…' : '重新生成报告'}
      </button>
      {done && <p role="status" className="report-success">报告已重新生成。</p>}
      {error && <p role="alert" className="inspect-alert">{error}</p>}
    </div>
  )
}
