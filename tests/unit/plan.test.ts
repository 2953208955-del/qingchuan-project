import { describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { createPlanForRun } from '@/lib/agent/plan'
import type { PlanIntent, PlannerPort } from '@/lib/agent/planner'
import { BudgetExceededError, BudgetTracker } from '@/lib/ai/budget'

function setup(options: { imageCount?: number; status?: string } = {}) {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  const run = repo.createRun(db, {
    instruction: '只统计塑料类，忽略水草',
    location: '示例河段',
  })
  for (let i = 0; i < (options.imageCount ?? 1); i++) {
    repo.addImage(db, {
      id: `i${i + 1}`,
      runId: run.id,
      filename: `${i + 1}.png`,
      path: `/tmp/${i + 1}.png`,
      sha256: String(i),
      status: 'pending',
    })
  }
  if (options.status) repo.updateRun(db, run.id, { status: options.status })
  return { db, runId: run.id }
}

function planIntent(
  focusCategories: PlanIntent['focusCategories'],
  intentSummary = '重点检查塑料类',
  tools: PlanIntent['tools'] = [],
  planningTrace: PlanIntent['planningTrace'] = [],
): PlanIntent {
  return { intentSummary, focusCategories, tools, planningTrace }
}

function planner(overrides: Partial<PlannerPort> = {}): PlannerPort & { parse: ReturnType<typeof vi.fn> } {
  return {
    parse: vi.fn(async () => planIntent(['plastic_bottle', 'plastic_bag', 'foam'])),
    ...overrides,
  } as never
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('createPlanForRun', () => {
  it('builds the five-step plan and persists the soft focus', async () => {
    const { db, runId } = setup()
    const parse = planner()

    const outcome = await createPlanForRun(db, runId, { planner: parse })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.plan.steps.map(step => step.key)).toEqual([
      'analyze', 'aggregate', 'retrieve', 'draft', 'verify',
    ])
    expect(outcome.plan.steps[0].detail).toContain('塑料瓶')
    expect(outcome.plan.steps[0].detail).toContain('其他类别仍会记录')
    expect(outcome.plan.parsedBy).toBe('llm')
    expect(outcome.plan.intentSummary).toBe('重点检查塑料类')
    expect(outcome.plan.estimatedSeconds).toBe(5)
    expect(outcome.plan.estimatedCostCny).toBe(0.02)

    const run = repo.getRun(db, runId)
    expect(run?.status).toBe('planned')
    expect(JSON.parse(run?.focusCategories ?? '[]')).toEqual([
      'plastic_bottle', 'plastic_bag', 'foam',
    ])
    const planStep = repo.listAgentSteps(db, runId).find(step => step.step === 'plan')
    expect(planStep).toMatchObject({ status: 'done', toolName: 'parseInstruction' })
    expect(planStep?.outputJson).toContain('"parsedBy":"llm"')
  })

  it('claims planning atomically so concurrent plan calls do not double-charge', async () => {
    const { db, runId } = setup()
    const gate = deferred<void>()
    const budget = new BudgetTracker(1)
    const parse = planner({
      parse: vi.fn(async () => {
        await gate.promise
        budget.add(0.01)
        return planIntent(['plastic_bottle'])
      }),
    })

    const first = createPlanForRun(db, runId, { planner: parse, budget })
    await vi.waitFor(() => expect(repo.getRun(db, runId)?.status).toBe('planning'))

    // Analysis must not be able to claim a run whose paid plan call is still
    // in flight; otherwise the plan write could reset an analyzing run.
    expect(repo.claimRunForAnalysis(db, runId)).toBe(0)
    const second = await createPlanForRun(db, runId, { planner: parse, budget })
    expect(second).toMatchObject({ ok: false, status: 409, code: 'RUN_BUSY' })

    gate.resolve()
    const firstOutcome = await first
    expect(firstOutcome.ok).toBe(true)
    expect(parse.parse).toHaveBeenCalledTimes(1)
    expect(repo.getRun(db, runId)?.status).toBe('planned')
    expect(repo.getRun(db, runId)?.totalCostCny).toBeCloseTo(0.01)
  })

  it('persists optional tools, planning trace and the full plan JSON on the run', async () => {
    const { db, runId } = setup()
    const trace = [{
      tool: 'search_standards',
      input: { query: '塑料垃圾' },
      output: { noEvidence: false, clauses: [] },
      latencyMs: 12,
    }]
    const parse = planner({
      parse: vi.fn(async () => planIntent(
        ['plastic_bottle'],
        '生成整改工单',
        ['create_work_order'],
        trace,
      )),
    })

    const outcome = await createPlanForRun(db, runId, { planner: parse })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.plan.tools).toEqual(['create_work_order'])
    expect(outcome.plan.planningTrace).toEqual(trace)
    const stored = JSON.parse(repo.getRun(db, runId)?.planJson ?? '{}') as {
      tools?: string[]
      planningTrace?: unknown[]
    }
    expect(stored.tools).toEqual(['create_work_order'])
    expect(stored.planningTrace).toEqual(trace)
  })

  it('falls back to keyword parsing when the planner fails', async () => {
    const { db, runId } = setup()
    const parse = planner({
      parse: vi.fn(async () => { throw new Error('planner down') }),
    })

    const outcome = await createPlanForRun(db, runId, { planner: parse })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.plan.parsedBy).toBe('heuristic')
    expect(outcome.plan.focusCategories).toEqual(['plastic_bottle', 'plastic_bag', 'foam'])
    expect(outcome.plan.steps).toHaveLength(5)
    const planStep = repo.listAgentSteps(db, runId).find(step => step.step === 'plan')
    expect(planStep?.detail).toContain('关键词')
    expect(planStep?.outputJson).toContain('"fallbackReason":"planner down"')
  })

  it('uses the heuristic parser when no planner is configured', async () => {
    const { db, runId } = setup()

    const outcome = await createPlanForRun(db, runId, {})

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.plan.parsedBy).toBe('heuristic')
    expect(repo.getRun(db, runId)?.status).toBe('planned')
    const planStep = repo.listAgentSteps(db, runId).find(step => step.step === 'plan')
    expect(planStep?.outputJson).toContain('"fallbackReason":"未配置文本模型"')
  })

  it('omits focus wording when no categories were requested', async () => {
    const { db, runId } = setup()
    const parse = planner({ parse: vi.fn(async () => planIntent([])) })

    const outcome = await createPlanForRun(db, runId, { planner: parse })

    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.plan.steps[0].detail).toBe('分析 1 张图片')
  })

  it('adds planner cost to the run total', async () => {
    const { db, runId } = setup()
    const budget = new BudgetTracker(1)
    const parse = planner({
      parse: vi.fn(async () => {
        budget.add(0.012345)
        return planIntent(['plastic_bottle'])
      }),
    })

    const outcome = await createPlanForRun(db, runId, { planner: parse, budget })

    expect(outcome.ok).toBe(true)
    expect(repo.getRun(db, runId)?.totalCostCny).toBeCloseTo(0.012345)
  })

  it('returns NOT_FOUND for a missing run', async () => {
    const { db } = setup()

    const outcome = await createPlanForRun(db, 'missing', { planner: planner() })

    expect(outcome).toMatchObject({ ok: false, status: 404, code: 'NOT_FOUND' })
  })

  it('returns NO_IMAGES when the run has no images', async () => {
    const { db, runId } = setup({ imageCount: 0 })

    const outcome = await createPlanForRun(db, runId, { planner: planner() })

    expect(outcome).toMatchObject({ ok: false, status: 400, code: 'NO_IMAGES' })
  })

  it('returns RUN_NOT_PLANNABLE once analysis has started', async () => {
    const { db, runId } = setup({ status: 'analyzing' })

    const outcome = await createPlanForRun(db, runId, { planner: planner() })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'RUN_NOT_PLANNABLE' })
  })

  it('rejects an exhausted per-run budget without falling back to keyword parsing', async () => {
    const { db, runId } = setup()
    const parse = planner()
    const budget = new BudgetTracker(1, 1)

    const outcome = await createPlanForRun(db, runId, { planner: parse, budget })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'BUDGET_EXCEEDED' })
    expect(parse.parse).not.toHaveBeenCalled()
    expect(repo.getRun(db, runId)?.status).toBe('failed')
  })

  it('rejects planning when the daily API budget is exhausted', async () => {
    const { db, runId } = setup()
    repo.updateRun(db, runId, { totalCostCny: 20 })
    const parse = planner()

    const outcome = await createPlanForRun(db, runId, {
      planner: parse,
      budget: new BudgetTracker(1),
      dailyBudgetCny: 20,
    })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'DAILY_BUDGET_EXCEEDED' })
    expect(parse.parse).not.toHaveBeenCalled()
  })

  it('does not let a budget error be swallowed by the heuristic fallback', async () => {
    const { db, runId } = setup()
    const budget = new BudgetTracker(1)
    const parse = planner({
      parse: vi.fn(async () => { throw new BudgetExceededError('over cap') }),
    })

    const outcome = await createPlanForRun(db, runId, { planner: parse, budget })

    expect(outcome).toMatchObject({ ok: false, status: 409, code: 'BUDGET_EXCEEDED' })
    expect(parse.parse).toHaveBeenCalledTimes(1)
  })
})
