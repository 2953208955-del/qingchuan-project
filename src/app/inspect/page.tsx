'use client'

import { useState } from 'react'
import { useInspectionStore } from '@/stores/inspection-store'
import { UploadDropzone } from '@/components/inspection/upload-dropzone'
import { InstructionInput } from '@/components/inspection/instruction-input'
import { VoiceInput } from '@/components/inspection/voice-input'
import { PlanConfirm } from '@/components/inspection/plan-confirm'
import { Plan } from '@/lib/domain/schemas'

type RunResponse = { id?: string; message?: string }

export default function InspectPage() {
  const [instruction, setInstruction] = useState('')
  const [location, setLocation] = useState('')
  const [planning, setPlanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const plan = useInspectionStore(s => s.plan)
  const images = useInspectionStore(s => s.images)

  // The plan is derived from instruction/location/images; changing any of them
  // makes the confirmed plan stale, so drop it (the UI renders store.plan).
  function invalidatePlan() {
    const store = useInspectionStore.getState()
    if (store.plan) store.setPlan(null)
  }

  function updateInstruction(value: string) {
    setInstruction(value)
    invalidatePlan()
  }

  function updateLocation(value: string) {
    setLocation(value)
    invalidatePlan()
  }

  async function createPlan() {
    setError(null)
    // Read the images from the store at call time so a just-finished upload is
    // never missed by a stale render closure.
    const currentImages = useInspectionStore.getState().images
    if (!instruction.trim() || currentImages.length === 0 || planning) return
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
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPlanning(false)
    }
  }

  // TASK 20 INTEGRATION POINT: replace this no-op with the SSE start call
  // (useRunStream / POST /api/runs/[id]/analyze) using store.runId. PlanConfirm
  // and the rest of this page stay unchanged; the timeline consumes the events.
  function handleConfirmPlan() {
    // Task 20 launches the streaming analysis from here.
  }

  function cancelPlan() {
    useInspectionStore.getState().setPlan(null)
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-heading text-2xl font-semibold text-foreground">巡检工作台</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          上传现场照片，描述巡检要求，确认执行计划后由 Agent 完成识别、取证与报告生成。
        </p>
      </header>

      <UploadDropzone />
      <InstructionInput value={instruction} onChange={updateInstruction} />

      <div className="flex flex-wrap items-start gap-4">
        <VoiceInput onText={updateInstruction} />
        <label className="block text-sm">
          地点（选填）
          <input
            value={location}
            onChange={e => updateLocation(e.target.value)}
            placeholder="例如：清川河 XX 桥段"
            className="mt-1 block w-64 rounded-lg border border-border bg-background p-2"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={createPlan}
        disabled={planning || !instruction.trim() || images.length === 0}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
      >
        {planning ? '生成计划中…' : '生成计划'}
      </button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {plan && <PlanConfirm plan={plan} onConfirm={handleConfirmPlan} onCancel={cancelPlan} />}
    </div>
  )
}
