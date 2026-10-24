import { DEFAULT_RERANK_MODEL } from '@/lib/ai/models'
import { postJsonWithTransportRetry } from '@/lib/ai/post-json'

export interface RerankResult {
  index: number
  score: number
}

export interface Reranker {
  rerank(query: string, documents: string[], topN: number): Promise<RerankResult[]>
}

export class DashScopeReranker implements Reranker {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.RERANK_MODEL ?? DEFAULT_RERANK_MODEL,
  ) {}

  async rerank(query: string, documents: string[], topN: number): Promise<RerankResult[]> {
    const res = await postJsonWithTransportRetry(
      'https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank',
      this.apiKey,
      {
        model: this.model,
        input: { query, documents },
        parameters: { return_documents: false, top_n: topN },
      },
    )
    if (!res.ok) throw new Error(`rerank failed: ${res.status}`)
    const json = await res.json() as {
      output?: { results?: { index: number; relevance_score: number }[] }
    }
    return (json.output?.results ?? [])
      .map(r => ({ index: r.index, score: r.relevance_score }))
      .slice(0, topN)
  }
}
