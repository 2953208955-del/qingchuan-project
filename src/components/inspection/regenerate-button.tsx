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
      <div className="space-y-1">
        <button
          type="button"
          disabled
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          还需复核 {pendingCount} 项
        </button>
        <p className="text-xs text-muted-foreground">复核完所有低置信结果后才能重新生成报告。</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        {busy ? '正在重新生成…' : '重新生成报告'}
      </button>
      {done && <p role="status" className="text-xs text-primary">报告已重新生成。</p>}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
