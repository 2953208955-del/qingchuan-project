import { DEFAULT_EMBEDDING_MODEL } from '@/lib/ai/models'
import { postJsonWithTransportRetry } from '@/lib/ai/post-json'

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>
}

export class DashScopeEmbedder implements Embedder {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await postJsonWithTransportRetry(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings',
      this.apiKey,
      // The current embedding model rejects `dimensions`; its default output
      // is already 1024, which is the width the knowledge base was designed for.
      { model: this.model, input: texts },
    )
    if (!res.ok) throw new Error(`embedding failed: ${res.status}`)
    const json = await res.json() as { data: { embedding: number[] }[] }
    return json.data.map(d => d.embedding)
  }
}
