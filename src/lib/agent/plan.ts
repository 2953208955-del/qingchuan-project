import type { Db } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import {
  BudgetExceededError,
  dailyBudgetError,
  dailyBudgetFromEnv,
  localDayBounds,
  type BudgetTracker,
} from '@/lib/ai/budget'
import {
  CATEGORY_LABELS,
  Plan as PlanSchema,
  type Plan,
  type PlanStep,
} from '@/lib/domain/schemas'
import { PROMPT_VERSIONS } from '@/lib/ai/prompts'
import { parseInstructionHeuristic, type PlanIntent, type PlannerPort } from './planner'

export type PlanErrorCode =
  | 'NOT_FOUND'
  | 'NO_IMAGES'
  | 'RUN_NOT_PLANNABLE'
  | 'RUN_BUSY'
  | 'BUDGET_EXCEEDED'
  | 'DAILY_BUDGET_EXCEEDED'
  | 'PLAN_FAILED'

export type PlanOutcome =
  | { ok: true; plan: Plan }
  | { ok: false; status: number; code: PlanErrorCode; message: string }

export interface PlanDeps {
  // Absent when no text-model key is configured; the heuristic parser still
  // produces a usable plan and keeps offline demos/E2E working.
  planner?: PlannerPort
  budget?: BudgetTracker
  dailyBudgetCny?: number
  now?: () => Date
}

function buildSteps(imageCount: number, focusCategories: PlanIntent['focusCategories']): PlanStep[] {
  const labels = focusCategories.map(category => CATEGORY_LABELS[category]).join('、')
  const focus = labels ? `，重点关注${labels}；其他类别仍会记录` : ''

  return [
    {
      key: 'analyze',
      title: '识别图片',
      detail: `分析 ${imageCount} 张图片${focus}`,
    },
    {
      key: 'aggregate',
      title: '汇总与严重度',
      detail: '按代码公式汇总加权检出量、检出强度与严重度',
    },
    {
      key: 'retrieve',
      title: '检索标准条款',
      detail: '检索清川 SOP 条款，并绑定到结论证据',
    },
    {
      key: 'draft',
      title: '起草报告',
      detail: '由文本模型起草结论；每条结论必须绑定证据',
    },
    {
      key: 'verify',
      title: '校验与复核',
      detail: '校验数字、证据与引用；低置信目标进入人工复核',
    },
  ]
}

function addPlanStep(input: {
  db: Db
  runId: string
  status: 'done' | 'error'
  detail: string
  outputJson: string | null
  error: string | null
  latencyMs: number
  costCny: number | null
  startedAt: number
  finishedAt: number
}) {
  repo.addAgentStep(input.db, {
    id: crypto.randomUUID(),
    runId: input.runId,
    step: 'plan',
    status: input.status,
    toolName: 'parseInstruction',
    inputJson: null,
    outputJson: input.outputJson,
    detail: input.detail,
    latencyMs: input.latencyMs,
    costCny: input.costCny,
    error: input.error,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  })
}

/**
 * Parse a run's natural-language instruction into a soft focus list and a
 * five-step execution plan. The plan never removes detections or changes
 * metrics; it only tells the VLM what to look at more closely and gives the
 * user an explicit confirmation step.
 */
export async function createPlanForRun(
  db: Db,
  runId: string,
  deps: PlanDeps,
): Promise<PlanOutcome> {
  const run = repo.getRun(db, runId)
  if (!run) return { ok: false, status: 404, code: 'NOT_FOUND', message: '任务不存在' }
  if (run.status === 'planning') {
    return { ok: false, status: 409, code: 'RUN_BUSY', message: '任务正在生成计划，请稍后再试' }
  }
  if (run.status !== 'idle' && run.status !== 'planned') {
    return {
      ok: false,
      status: 409,
      code: 'RUN_NOT_PLANNABLE',
      message: `任务当前状态为 ${run.status}，无法生成计划`,
    }
  }

  const images = repo.listImages(db, runId)
  if (images.length === 0) {
    return { ok: false, status: 400, code: 'NO_IMAGES', message: '没有可分析的图片' }
  }

  const now = deps.now ?? (() => new Date())
  const startedAt = now().getTime()
  const beforeCost = deps.budget?.spent ?? run.totalCostCny
  const costDelta = () => Math.max(0, (deps.budget?.spent ?? beforeCost) - beforeCost)

  const fail = (message: string, code: PlanErrorCode, status: number): PlanOutcome => {
    repo.updateRun(db, runId, {
      status: 'failed',
      error: message,
      totalCostCny: deps.budget?.spent ?? run.totalCostCny,
    })
    addPlanStep({
      db, runId, status: 'error', detail: message, outputJson: null,
      error: message, latencyMs: Math.max(0, now().getTime() - startedAt),
      costCny: costDelta(), startedAt, finishedAt: now().getTime(),
    })
    return { ok: false, status, code, message }
  }

  // The planner call is paid and asynchronous. Claim the run before touching
  // the model so a concurrent plan cannot double-charge and analyze cannot
  // claim the run and then be reset to `planned` by our final write.
  if (repo.claimRunForPlanning(db, runId) === 0) {
    return {
      ok: false,
      status: 409,
      code: 'RUN_BUSY',
      message: '任务正在生成计划或已开始分析，请稍后再试',
    }
  }

  try {
    // A planner call is paid. Keep it inside both the per-run and daily caps;
    // the heuristic fallback is free and is still allowed without a planner.
    if (deps.planner) {
      if (deps.budget && deps.budget.remaining <= 0) {
        return fail('本次运行预算已用完，无法生成计划', 'BUDGET_EXCEEDED', 409)
      }

      const today = localDayBounds(now())
      const dailySpent = repo.sumRunCostCnyBetween(db, today.start, today.end)
      const dailyError = dailyBudgetError(dailySpent, deps.dailyBudgetCny ?? dailyBudgetFromEnv())
      if (dailyError) {
        // This is a day-level gate, not a broken run: restore the pre-claim
        // status so the same run can be planned tomorrow.
        repo.updateRun(db, runId, { status: run.status })
        return { ok: false, status: 409, code: 'DAILY_BUDGET_EXCEEDED', message: dailyError }
      }
    }

    let intent: PlanIntent | null = null
    let parsedBy: 'llm' | 'heuristic' = 'heuristic'
    let fallbackReason: string | null = null

    if (deps.planner) {
      try {
        intent = await deps.planner.parse({ instruction: run.instruction, imageCount: images.length })
        parsedBy = 'llm'
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (error instanceof BudgetExceededError) {
          return fail(`预算超限：${message}`, 'BUDGET_EXCEEDED', 409)
        }

        // Model outage, timeout or invalid output must not block the
        // inspection: the deterministic parser is the documented fallback.
        fallbackReason = message
        intent = parseInstructionHeuristic(run.instruction)
      }
    } else {
      fallbackReason = '未配置文本模型'
      intent = parseInstructionHeuristic(run.instruction)
    }

    if (!intent) throw new Error('任务解析没有返回结果')

    const plan = PlanSchema.parse({
      imageCount: images.length,
      focusCategories: intent.focusCategories,
      intentSummary: intent.intentSummary,
      steps: buildSteps(images.length, intent.focusCategories),
      tools: intent.tools,
      planningTrace: intent.planningTrace,
      parsedBy,
      estimatedSeconds: images.length * 5,
      estimatedCostCny: Number((images.length * 0.02).toFixed(2)),
      output: 'inspection_report',
    })

    const totalCostCny = deps.budget?.spent ?? run.totalCostCny
    repo.updateRun(db, runId, {
      status: 'planned',
      focusCategories: JSON.stringify(intent.focusCategories),
      planJson: JSON.stringify(plan),
      totalCostCny,
      error: null,
    })

    const labels = intent.focusCategories.map(category => CATEGORY_LABELS[category]).join('、')
    const detail = parsedBy === 'llm'
      ? `模型解析：${labels || '全部类别'}`
      : `关键词解析${fallbackReason ? `（回退：${fallbackReason}）` : ''}：${labels || '全部类别'}`

    addPlanStep({
      db,
      runId,
      status: 'done',
      detail,
      outputJson: JSON.stringify({
        intentSummary: intent.intentSummary,
        focusCategories: intent.focusCategories,
        tools: intent.tools,
        planningTrace: intent.planningTrace,
        parsedBy,
        fallbackReason,
        promptVersion: parsedBy === 'llm' ? PROMPT_VERSIONS.planner : null,
      }),
      error: null,
      latencyMs: Math.max(0, now().getTime() - startedAt),
      costCny: costDelta(),
      startedAt,
      finishedAt: now().getTime(),
    })

    return { ok: true, plan }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(`生成计划失败：${message}`, 'PLAN_FAILED', 500)
  }
}
