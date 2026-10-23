import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { runInspection } from '@/lib/agent/orchestrator'
import { DeepSeekReportGenerator } from '@/lib/agent/report-generator'
import { RagRetrievalAdapter } from '@/lib/agent/retrieval-adapter'
import { QwenVisionAnalyzer } from '@/lib/vision/qwen'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { BudgetTracker } from '@/lib/ai/budget'
import { verifyReport } from '@/lib/domain/evidence'
import { encodeSse } from '@/lib/agent/sse'
import type { AgentEvent } from '@/lib/agent/types'
import { RateLimiter, clientKey } from '@/lib/http/rate-limit'
import * as repo from '@/lib/db/repo'

export const runtime = 'nodejs'
export const maxDuration = 300

const analyzeLimiter = new RateLimiter(3, 60_000)

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!analyzeLimiter.check(clientKey(request))) {
    return NextResponse.json({ code: 'RATE_LIMITED', message: '分析请求过于频繁，请稍后再试', retryable: true }, { status: 429 })
  }

  const { id } = await params
  const db = getDb()
  // Re-analyzing a finished or in-flight run would duplicate detections, so the
  // gate runs before the stream is opened.
  const run = repo.getRun(db, id)
  if (!run) return NextResponse.json({ code: 'NOT_FOUND', message: '任务不存在', retryable: false }, { status: 404 })
  if (run.status !== 'idle' && run.status !== 'planned') {
    return NextResponse.json(
      { code: 'RUN_NOT_STARTABLE', message: `任务当前状态为 ${run.status}，无法开始分析`, retryable: false },
      { status: 409 },
    )
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // A disconnected client makes enqueue throw; swallowing it keeps the paid
      // orchestrator work (and its DB writes) independent of the stream state.
      const emit = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeSse(event)))
        } catch {
          // Client disconnected or stream already closed.
        }
      }
      try {
        await runInspection(id, {
          db, repo,
          vision: new QwenVisionAnalyzer({
            apiKey: process.env.DASHSCOPE_API_KEY ?? '',
            model: process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest',
          }),
          retrieval: new RagRetrievalAdapter(
            db,
            new DashScopeEmbedder(process.env.DASHSCOPE_API_KEY ?? ''),
            new DashScopeReranker(process.env.DASHSCOPE_API_KEY ?? ''),
          ),
          reporter: new DeepSeekReportGenerator(),
          verifier: { verify: verifyReport },
          budget: new BudgetTracker(Number(process.env.RUN_BUDGET_CNY ?? 1)),
          emit,
          now: () => new Date(),
        })
      } catch (error) {
        emit({ type: 'error', runId: id, message: (error as Error).message })
      } finally {
        try {
          controller.close()
        } catch {
          // Stream already closed by the client disconnect.
        }
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
