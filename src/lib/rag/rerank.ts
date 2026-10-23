import { AI_CALL_TIMEOUT_MS } from '@/lib/ai/providers'

export interface RerankResult {
  index: number
  score: number
}

export interface Reranker {
  rerank(query: string, documents: string[], topN: number): Promise<RerankResult[]>
}

export class DashScopeReranker implements Reranker {
  constructor(private readonly apiKey: string, private readonly model = 'gte-rerank') {}

  async rerank(query: string, documents: string[], topN: number): Promise<RerankResult[]> {
    const res = await fetch('https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        input: { query, documents },
        parameters: { return_documents: false, top_n: topN },
      }),
      signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`rerank failed: ${res.status}`)
    const json = await res.json() as {
      output?: { results?: { index: number; relevance_score: number }[] }
    }
    return (json.output?.results ?? [])
      .map(r => ({ index: r.index, score: r.relevance_score }))
      .slice(0, topN)
  }
}
