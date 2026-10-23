import pLimit from 'p-limit'
import { buildEvidenceIndex } from '@/lib/domain/evidence'
import { computeSeverity } from '@/lib/domain/severity'
import { scanForInjection } from '@/lib/safety/injection'
import { BudgetExceededError, estimateCostCny } from '@/lib/ai/budget'
import { DebrisCategory } from '@/lib/domain/schemas'
import type { Detection, RunStatus } from '@/lib/domain/schemas'
import type { OrchestratorDeps } from './types'

const LOW_CONFIDENCE = 0.5
const MAX_CONCURRENCY = 4
const CATEGORY_VALUES = new Set<string>(DebrisCategory.options)

function visionModel(): string {
  return process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest'
}

// run.focusCategories is user-supplied JSON; anything malformed or outside the
// known categories is ignored rather than allowed to break the run.
function parseFocusCategories(raw: string | null | undefined): DebrisCategory[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is DebrisCategory => typeof value === 'string' && CATEGORY_VALUES.has(value))
  } catch {
    return []
  }
}

function detectedCategories(detections: Detection[]): DebrisCategory[] {
  return [...new Set(detections.map(d => d.category))]
}

export async function runInspection(runId: string, deps: OrchestratorDeps): Promise<RunStatus> {
  const { db, repo } = deps
  const run = repo.getRun(db, runId)
  if (!run) throw new Error('run not found')

  const failureMessage = (error: unknown) =>
    error instanceof BudgetExceededError ? `预算超限：${error.message}` : String(error)

  const fail = (message: string): RunStatus => {
    repo.updateRun(db, runId, { status: 'failed', error: message, totalCostCny: deps.budget.spent })
    deps.emit({ type: 'error', runId, message })
    return 'failed'
  }

  const injection = scanForInjection(run.instruction)
  if (injection.suspicious) return fail('指令包含可疑内容')

  const images = repo.listImages(db, runId)
  if (images.length === 0) return fail('没有可用图片')

  const focusCategories = parseFocusCategories(run.focusCategories)
  repo.updateRun(db, runId, { status: 'analyzing' })

  const limit = pLimit(MAX_CONCURRENCY)
  const allDetections: Detection[] = []
  let analyzed = 0

  try {
    await Promise.all(images.map(image => limit(async () => {
      const startedAt = deps.now().getTime()
      const step = {
        id: crypto.randomUUID(),
        runId,
        step: 'analyze_image',
        status: 'running',
        toolName: 'analyzeImage',
        inputJson: JSON.stringify({ imageId: image.id }),
        outputJson: null,
        detail: image.filename,
        latencyMs: null,
        costCny: null,
        error: null,
        startedAt,
        finishedAt: null,
      }
      repo.addAgentStep(db, step)
      deps.emit({
        type: 'step', runId,
        step: { id: step.id, step: step.step, status: 'running', toolName: step.toolName, detail: step.detail, latencyMs: null, costCny: null },
      })

      let costCny: number | null = null
      try {
        const result = await deps.vision.analyze({
          imagePath: image.path,
          focusCategories,
          hint: image.hint ?? undefined,
        })
        // Compute once so an abstained/invalid response still records its cost:
        // abstained results were billed tokens too.
        costCny = estimateCostCny(visionModel(), result.usage)
        deps.budget.add(costCny)
        if (result.abstained) throw new Error(result.reason ?? '无法判定')

        const createdAt = deps.now().getTime()
        const rows = result.detections.map(d => ({
          id: crypto.randomUUID(),
          runId,
          imageId: image.id,
          category: d.category,
          material: d.material,
          confidence: d.confidence,
          bboxJson: d.bbox ? JSON.stringify(d.bbox) : null,
          description: d.description,
          source: 'vlm',
          reviewStatus: 'pending' as const,
          createdAt,
        }))
        const stored: Detection[] = result.detections.map((d, index) => ({
          id: rows[index].id,
          imageId: image.id,
          category: d.category,
          material: d.material,
          confidence: d.confidence,
          bbox: d.bbox,
          description: d.description,
          source: 'vlm',
          reviewStatus: 'pending',
        }))
        repo.addDetections(db, rows)
        repo.updateImage(db, image.id, { status: 'analyzed' })
        allDetections.push(...stored)
        analyzed++

        const latencyMs = deps.now().getTime() - startedAt
        repo.updateAgentStep(db, step.id, { status: 'done', latencyMs, costCny, finishedAt: deps.now().getTime() })
        deps.emit({
          type: 'step', runId,
          step: { id: step.id, step: step.step, status: 'done', toolName: step.toolName, detail: `${stored.length} 个目标`, latencyMs, costCny },
        })
      } catch (error) {
        const latencyMs = deps.now().getTime() - startedAt
        repo.updateAgentStep(db, step.id, {
          status: 'error', error: String(error), latencyMs, costCny, finishedAt: deps.now().getTime(),
        })
        deps.emit({
          type: 'step', runId,
          step: { id: step.id, step: step.step, status: 'error', toolName: step.toolName, detail: String(error), latencyMs, costCny },
        })
        // Budget exhaustion aborts the whole run: it must not be swallowed as
        // an ordinary per-image failure and the caller must stop calling add.
        if (error instanceof BudgetExceededError) throw error
        repo.updateImage(db, image.id, { status: 'failed' })
      }
    })))
  } catch (error) {
    return fail(failureMessage(error))
  }

  if (analyzed === 0) return fail('所有图片均识别失败')

  try {
    repo.updateRun(db, runId, { status: 'aggregating' })
    const severity = computeSeverity(allDetections, analyzed)

    repo.updateRun(db, runId, { status: 'retrieving' })
    const categories = focusCategories.length > 0 ? focusCategories : detectedCategories(allDetections)
    const { clauses } = await deps.retrieval.retrieve(run.instruction, categories)

    const metrics = {
      imageCount: analyzed,
      detectionCount: allDetections.length,
      weightedTotal: severity.weightedTotal,
      intensity: severity.intensity,
      severity: severity.overall,
      formulaVersion: severity.formulaVersion,
    }
    const context = {
      runId,
      instruction: run.instruction,
      location: run.location,
      inspectedAt: deps.now().toISOString(),
      detections: allDetections,
      metrics,
      clauses,
    }

    repo.updateRun(db, runId, { status: 'drafting' })
    let report = await deps.reporter.draft(context)
    const index = buildEvidenceIndex({ detections: allDetections, clauses, metrics })

    repo.updateRun(db, runId, { status: 'verifying' })
    let verification = deps.verifier.verify(report, index)
    if (!verification.passed) {
      report = await deps.reporter.repair(context, verification.issues)
      verification = deps.verifier.verify(report, index)
    }

    repo.saveReport(db, {
      id: crypto.randomUUID(),
      runId,
      version: (repo.getLatestReport(db, runId)?.version ?? 0) + 1,
      contentJson: JSON.stringify(report),
      status: verification.passed ? 'draft' : 'needs_review',
    })

    const hasLowConfidence = allDetections.some(d => d.confidence < LOW_CONFIDENCE)
    const finalStatus: RunStatus = verification.passed && !hasLowConfidence ? 'completed' : 'awaiting_review'
    repo.updateRun(db, runId, { status: finalStatus, error: null, totalCostCny: deps.budget.spent })
    deps.emit({ type: 'done', runId, status: finalStatus })
    return finalStatus
  } catch (error) {
    return fail(failureMessage(error))
  }
}
