import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { retrieveClauses } from '@/lib/rag/retrieve'
import { RATE_LIMITS, RateLimiter, clientKey } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'

// Search triggers a paid embedding + rerank call; it has its own allowance so
// repeated searches cannot exhaust the (much tighter) analyze budget.
const searchLimiter = new RateLimiter(RATE_LIMITS.knowledgeSearch.limit, RATE_LIMITS.knowledgeSearch.windowMs)

export async function POST(request: Request) {
  if (!searchLimiter.check(clientKey(request))) {
    return NextResponse.json(
      { code: 'RATE_LIMITED', message: '检索请求过于频繁，请稍后再试', retryable: true },
      { status: 429 },
    )
  }
  const { query } = await request.json() as { query?: string }
  if (!query?.trim()) return NextResponse.json({ code: 'INVALID_INPUT', message: '查询不能为空', retryable: false }, { status: 400 })
  const apiKey = process.env.DASHSCOPE_API_KEY ?? ''
  try {
    const result = await retrieveClauses(
      { db: getDb(), embedder: new DashScopeEmbedder(apiKey), reranker: new DashScopeReranker(apiKey) },
      query, [], 5, 0.25,
    )
    return NextResponse.json(result)
  } catch (error) {
    // Embedding/network failure is an upstream outage, not a client error.
    return NextResponse.json(
      { code: 'RETRIEVAL_FAILED', message: (error as Error).message, retryable: true },
      { status: 502 },
    )
  }
}
