import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { getRun } from '@/lib/db/repo'
import { createPlanForRun } from '@/lib/agent/plan'
import { DeepSeekInspectionPlanner, DeepSeekPlanningAgent } from '@/lib/agent/planner'
import { BudgetTracker, dailyBudgetFromEnv, runBudgetFromEnv } from '@/lib/ai/budget'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { RATE_LIMITS, RateLimiter, clientKey } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 120

// Planning can make one paid text-model call; keep it on its own allowance.
const planLimiter = new RateLimiter(RATE_LIMITS.plan.limit, RATE_LIMITS.plan.windowMs)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!planLimiter.check(clientKey(request))) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: '生成计划请求过于频繁，请稍后再试', retryable: true },
      { status: 429 },
    )
  }

  const { id } = await params
  const db = getDb()
  const run = getRun(db, id)
  if (!run) {
    return NextResponse.json({ code: 'NOT_FOUND', message: '任务不存在', retryable: false }, { status: 404 })
  }

  // Seed with the run's persisted spend so a plan call counts against the same
  // per-run cap that the later analysis uses.
  const budget = new BudgetTracker(runBudgetFromEnv(), run.totalCostCny)
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim() ?? ''
  const dashscopeKey = process.env.DASHSCOPE_API_KEY?.trim() ?? ''
  const planner = !deepseekKey
    ? undefined
    : dashscopeKey
      ? new DeepSeekPlanningAgent({
          db,
          budget,
          embedder: new DashScopeEmbedder(dashscopeKey),
          reranker: new DashScopeReranker(dashscopeKey),
        })
      : new DeepSeekInspectionPlanner({ budget })

  const outcome = await createPlanForRun(db, id, {
    planner,
    budget,
    dailyBudgetCny: dailyBudgetFromEnv(),
  })

  if (outcome.ok) return NextResponse.json(outcome.plan)
  return NextResponse.json(
    { code: outcome.code, message: outcome.message, retryable: false },
    { status: outcome.status },
  )
}
