import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import * as repo from '@/lib/db/repo'
import { regenerateReport } from '@/lib/agent/regenerate'
import { RagRetrievalAdapter } from '@/lib/agent/retrieval-adapter'
import { DeepSeekReportGenerator } from '@/lib/agent/report-generator'
import { BudgetTracker } from '@/lib/ai/budget'
import { verifyReport } from '@/lib/domain/evidence'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { RateLimiter, clientKey } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 300

// Regeneration is paid (embedding + rerank + DeepSeek drafts); cap the loop the
// same way the analyze route caps analysis.
const regenerateLimiter = new RateLimiter(3, 60_000)

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = repo.getLatestReport(getDb(), id)
  if (!report) return NextResponse.json({ code: 'NOT_FOUND', message: '报告不存在', retryable: false }, { status: 404 })
  if (report.status === 'stale') {
    return NextResponse.json({ code: 'REPORT_STALE', message: '识别结果已修改，请重新生成报告', retryable: true }, { status: 409 })
  }
  return NextResponse.json(report)
}

// Rebuild the report from the current (reviewed) detection rows. This is the
// end of the human-review loop: once every low-confidence finding is resolved,
// the report can be regenerated and, if it verifies, exported.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!regenerateLimiter.check(clientKey(request))) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: '重新生成请求过于频繁，请稍后再试', retryable: true },
      { status: 429 },
    )
  }

  const { id } = await params
  const db = getDb()
  const run = repo.getRun(db, id)
  // Seeding the tracker with the run's stored spend keeps regeneration inside
  // the same per-run RUN_BUDGET_CNY cap as analysis.
  const budget = new BudgetTracker(Number(process.env.RUN_BUDGET_CNY ?? 1), run?.totalCostCny ?? 0)
  const apiKey = process.env.DASHSCOPE_API_KEY ?? ''

  const outcome = await regenerateReport(db, id, {
    retrieval: new RagRetrievalAdapter(db, new DashScopeEmbedder(apiKey), new DashScopeReranker(apiKey)),
    reporter: new DeepSeekReportGenerator({ budget }),
    verifier: { verify: verifyReport },
    budget,
  })

  if (outcome.ok) {
    return NextResponse.json({
      report: outcome.report,
      runStatus: outcome.runStatus,
      totalCostCny: outcome.totalCostCny,
    })
  }
  return NextResponse.json(
    {
      code: outcome.code,
      message: outcome.message,
      retryable: outcome.code === 'RUN_BUSY' || outcome.code === 'REPORT_FAILED',
      ...(outcome.pendingCount !== undefined ? { pendingCount: outcome.pendingCount } : {}),
    },
    { status: outcome.status },
  )
}
