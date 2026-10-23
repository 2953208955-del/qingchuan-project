'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BBox, Clause, Detection, ReportDraft, UploadedImage,
  type AgentStep,
} from '@/lib/domain/schemas'
import { parseSseChunk } from '@/lib/agent/sse-parse'
import type { AgentEvent } from '@/lib/agent/types'
import { useInspectionStore } from '@/stores/inspection-store'

const STEP_STATUSES = new Set<AgentStep['status']>(['pending', 'running', 'done', 'error', 'skipped'])

// The SSE payload types status as a plain string. Anything outside the stored
// union is treated as still running instead of being cast blindly into the UI.
function normalizeStepStatus(status: string | undefined): AgentStep['status'] {
  return status && STEP_STATUSES.has(status as AgentStep['status'])
    ? (status as AgentStep['status'])
    : 'running'
}

type RunDetailBody = {
  run?: { instruction?: unknown } | null
  images?: unknown
  detections?: unknown
}

function parseImages(value: unknown): UploadedImage[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    const parsed = UploadedImage.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

// DB rows carry bboxJson; the canvas needs a parsed bbox. A malformed bbox
// degrades to "detection without an overlay" rather than dropping the finding.
function parseDetections(value: unknown): Detection[] {
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

async function responseMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null
  return typeof body?.message === 'string' && body.message ? body.message : fallback
}

// Report and clauses are secondary: a failure there must not turn a completed
// analysis into an error screen. Each loader leaves the store untouched on
// failure, so the panel falls back to its empty state.
async function loadReport(runId: string, setReport: (report: ReportDraft | null) => void): Promise<void> {
  try {
    const res = await fetch(`/api/runs/${runId}/report`)
    if (!res.ok) return
    const row = (await res.json()) as { contentJson?: unknown }
    if (typeof row.contentJson !== 'string') return
    const parsed = ReportDraft.safeParse(JSON.parse(row.contentJson))
    if (parsed.success) setReport(parsed.data)
  } catch {
    // Report is optional for this screen (Task 21 renders it).
  }
}

async function loadClauses(instruction: string, setClauses: (clauses: Clause[]) => void): Promise<void> {
  if (!instruction.trim()) return
  try {
    // Deliberate re-retrieval: the clause ids are deterministic
    // (sha1(documentId:clauseNo)), so report evidence refs still match.
    const res = await fetch('/api/knowledge/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: instruction }),
    })
    if (!res.ok) return
    const body = (await res.json()) as { clauses?: unknown }
    const parsed = Clause.array().safeParse(body.clauses)
    if (parsed.success) setClauses(parsed.data)
  } catch {
    // Leave clauses empty; ClausePanel shows its no-evidence message.
  }
}

export interface RunStreamResult {
  status: string | null
}

export function useRunStream() {
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      abortRef.current?.abort()
    }
  }, [])

  // Stable identity: the store is read via getState(), so store updates never
  // recreate `start` (which would otherwise re-render every consumer).
  const start = useCallback(async (runId: string): Promise<RunStreamResult | null> => {
    if (abortRef.current) throw new Error('分析已在进行中')

    const store = useInspectionStore.getState()
    // Clear prior results so a re-run never shows stale steps, boxes, clauses
    // or report. runId/images/plan belong to the run being started, so they are
    // snapshotted and restored (the store exposes no partial clear).
    const { images, plan } = store
    store.reset()
    store.setRunId(runId)
    store.setImages(images)
    store.setPlan(plan)

    const controller = new AbortController()
    abortRef.current = controller
    setRunning(true)

    try {
      const res = await fetch(`/api/runs/${runId}/analyze`, { method: 'POST', signal: controller.signal })
      // 404/409/429 arrive as JSON before the stream exists; surface the message
      // instead of treating the body as a stream.
      if (!res.ok) throw new Error(await responseMessage(res, `分析请求失败（${res.status}）`))
      if (!res.body) throw new Error('无响应流')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let finalStatus: string | null = null
      let finished = false

      const handleEvent = async (event: AgentEvent): Promise<void> => {
        if (event.type === 'error') throw new Error(event.message ?? '分析失败')
        if (event.type === 'step' && event.step) {
          store.upsertStep({
            id: event.step.id,
            runId,
            step: event.step.step,
            status: normalizeStepStatus(event.step.status),
            toolName: event.step.toolName,
            detail: event.step.detail,
            latencyMs: event.step.latencyMs,
            costCny: event.step.costCny,
          })
          return
        }
        if (event.type !== 'done') return

        finalStatus = event.status ?? null
        const detailRes = await fetch(`/api/runs/${runId}`, { signal: controller.signal })
        if (!detailRes.ok) throw new Error(await responseMessage(detailRes, '读取分析结果失败'))
        const detail = (await detailRes.json()) as RunDetailBody
        store.setImages(parseImages(detail.images))
        store.setDetections(parseDetections(detail.detections))
        await loadReport(runId, store.setReport)
        const instruction = typeof detail.run?.instruction === 'string' ? detail.run.instruction : ''
        await loadClauses(instruction, store.setClauses)
        finished = true
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parsed = parseSseChunk(buffer)
        buffer = parsed.rest
        for (const event of parsed.events) await handleEvent(event)
      }

      if (!finished) throw new Error('分析连接意外中断，请重试')
      return { status: finalStatus }
    } catch (error) {
      // Unmount aborts the reader; that is not a user-facing failure.
      if (controller.signal.aborted) return null
      throw error
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      if (mountedRef.current) setRunning(false)
    }
  }, [])

  return { start, running }
}
