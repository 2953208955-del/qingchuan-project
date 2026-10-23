import { NextResponse } from 'next/server'
import { getDb } from '@/lib/db/client'
import { DashScopeEmbedder } from '@/lib/rag/embed'
import { DashScopeReranker } from '@/lib/rag/rerank'
import { retrieveClauses } from '@/lib/rag/retrieve'

export const runtime = 'nodejs'

export async function POST(request: Request) {
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
