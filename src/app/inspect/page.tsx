'use client'

import { useRef, useState } from 'react'
import { useInspectionStore } from '@/stores/inspection-store'
import { useRunStream } from '@/hooks/use-run-stream'
import { UploadDropzone } from '@/components/inspection/upload-dropzone'
import { InstructionInput } from '@/components/inspection/instruction-input'
import { VoiceInput } from '@/components/inspection/voice-input'
import { PlanConfirm } from '@/components/inspection/plan-confirm'
import { AgentTimeline } from '@/components/inspection/agent-timeline'
import { EvidenceCanvas } from '@/components/inspection/evidence-canvas'
import { DetectionList } from '@/components/inspection/detection-list'
import { ClausePanel } from '@/components/inspection/clause-panel'
import { ReviewQueue } from '@/components/inspection/review-queue'
import { fetchRunResults } from '@/lib/api/run-results'
import { Plan } from '@/lib/domain/schemas'

type RunResponse = { id?: string; message?: string }

export default function InspectPage() {
  const [instruction, setInstruction] = useState('')
  const [location, setLocation] = useState('')
  const [planning, setPlanning] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `started` locks the launch button; `finished` gates the evidence view so the
  // canvas never renders the pre-analysis upload ids (only DB ids resolve).
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const [finalStatus, setFinalStatus] = useState<string | null>(null)
  // Reviewing a detection marks the stored report stale; the report API then
  // answers 409, so surface that instead of keeping a silently outdated draft.
  const [reportStale, setReportStale] = useState(false)
  // A ref locks the launch synchronously, before React re-renders with
  // `started`, so two clicks in one frame cannot open two streams.
  const startedRef = useRef(false)
  const plan = useInspectionStore(s => s.plan)
  const runId = useInspectionStore(s => s.runId)
  const images = useInspectionStore(s => s.images)
  const detections = useInspectionStore(s => s.detections)
  const clauses = useInspectionStore(s => s.clauses)
  const { start, running } = useRunStream()
  const busy = planning || running

  // The plan is derived from instruction/location/images; changing any of them
  // makes the confirmed plan stale, so drop it (the UI renders store.plan).
  function invalidatePlan() {
    const store = useInspectionStore.getState()
    if (store.plan) store.setPlan(null)
  }

  function updateInstruction(value: string) {
    setInstruction(value)
    setError(null)
    invalidatePlan()
  }

  function updateLocation(value: string) {
    setLocation(value)
    setError(null)
    invalidatePlan()
  }

  async function createPlan() {
    setError(null)
    // Read the images from the store at call time so a just-finished upload is
    // never missed by a stale render closure.
    const currentImages = useInspectionStore.getState().images
    // Never start planning while a batch is uploading, and vice versa: the
    // dropzone is disabled while `planning`, so the upload snapshot cannot move
    // between the request and the reset below.
    if (!instruction.trim() || currentImages.length === 0 || planning || uploading || running) return
    setPlanning(true)
    try {
      const runRes = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instruction: instruction.trim(),
          location: location.trim() || null,
          images: currentImages.map(({ filename, path, sha256 }) => ({ filename, path, sha256 })),
        }),
      })
      const run = (await runRes.json().catch(() => null)) as RunResponse | null
      if (!runRes.ok || !run?.id) throw new Error(run?.message ?? '创建巡检任务失败')

      const planRes = await fetch(`/api/runs/${run.id}/plan`, { method: 'POST' })
      const planJson: unknown = await planRes.json().catch(() => null)
      if (!planRes.ok) {
        throw new Error((planJson as { message?: string } | null)?.message ?? '生成执行计划失败')
      }
      const parsed = Plan.safeParse(planJson)
      if (!parsed.success) throw new Error('执行计划格式异常，请重试')

      // Reset first so stale steps/detections/report/selections from a previous
      // run never leak into this plan.
      const store = useInspectionStore.getState()
      store.reset()
      store.setRunId(run.id)
      store.setImages(currentImages)
      store.setPlan(parsed.data)
      startedRef.current = false
      setStarted(false)
      setFinished(false)
      setFinalStatus(null)
      setReportStale(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPlanning(false)
    }
  }

  async function handleConfirmPlan() {
    const store = useInspectionStore.getState()
    const currentRunId = store.runId
    if (!currentRunId || running || startedRef.current) return
    startedRef.current = true
    setError(null)
    setStarted(true)
    setFinished(false)
    setFinalStatus(null)
    try {
      const result = await start(currentRunId)
      if (!result) return
      setFinalStatus(result.status)
      setFinished(true)
    } catch (err) {
      setError((err as Error).message)
      // A launch rejected before any step streamed (e.g. 404/409/429) means the
      // run never started, so allow another attempt. Once events streamed, the
      // server run is no longer startable and the launcher stays locked.
      if (useInspectionStore.getState().steps.length === 0) {
        startedRef.current = false
        setStarted(false)
      }
    }
  }

  function cancelPlan() {
    useInspectionStore.getState().setPlan(null)
  }

  // Called by the review queue after a successful PATCH: re-read the run so
  // revised categories/statuses replace the store snapshot. A 409 from the
  // report endpoint means the review marked the report stale.
  async function refetchResults() {
    const currentRunId = useInspectionStore.getState().runId
    if (!currentRunId) return
    try {
      const results = await fetchRunResults(currentRunId)
      const store = useInspectionStore.getState()
      store.setImages(results.images)
      store.setDetections(results.detections)
      store.setReport(results.report)
      setReportStale(results.reportStale)
    } catch {
      setError('复核已提交，但刷新识别结果失败，请刷新页面。')
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-2xl font-semibold text-foreground">巡检工作台</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传现场照片，描述巡检要求，确认执行计划后由 Agent 完成识别、取证与报告生成。
        </p>
      </header>

      <UploadDropzone disabled={busy} onBusyChange={setUploading} />
      <InstructionInput value={instruction} onChange={updateInstruction} disabled={busy} />

      <div className="flex flex-wrap items-start gap-4">
        <VoiceInput onText={updateInstruction} disabled={busy} />
        <label className="block text-sm">
          地点（选填）
          <input
            value={location}
            onChange={e => updateLocation(e.target.value)}
            disabled={busy}
            placeholder="例如：清川河 XX 桥段"
            className="mt-1 block w-64 rounded-lg border border-border bg-background p-2 disabled:opacity-50"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={createPlan}
        disabled={busy || uploading || !instruction.trim() || images.length === 0}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        {planning ? '生成计划中…' : '生成计划'}
      </button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {plan && (
        <PlanConfirm
          plan={plan}
          onConfirm={handleConfirmPlan}
          onCancel={cancelPlan}
          disabled={busy || started}
        />
      )}

      {started && runId && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div>
            {finished ? (
              <EvidenceCanvas images={images} detections={detections} />
            ) : (
              <section aria-label="证据画布" className="rounded-xl border border-dashed border-border p-6">
                <p className="text-sm text-muted-foreground">
                  {running ? '分析进行中，识别框将在分析完成后显示。' : '分析未完成，暂无识别结果。'}
                </p>
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <AgentTimeline runId={runId} finalStatus={finalStatus} />
            <DetectionList detections={detections} />
            {finished && <ReviewQueue runId={runId} detections={detections} onChanged={refetchResults} />}
            {reportStale && (
              <p role="status" aria-live="polite" className="text-xs text-destructive">
                识别结果已复核修改，现有报告已过期，请返回工作台重新发起巡检。
              </p>
            )}
            <section aria-label="检索到的标准条款" className="space-y-2">
              <h2 className="text-sm font-medium">标准条款</h2>
              <ClausePanel clauses={clauses} />
            </section>
          </aside>
        </div>
      )}
    </div>
  )
}
