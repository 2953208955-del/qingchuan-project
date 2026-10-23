import { AI_CALL_TIMEOUT_MS } from '@/lib/ai/providers'

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>
}

export class DashScopeEmbedder implements Embedder {
  constructor(private readonly apiKey: string, private readonly model = 'text-embedding-v3') {}

  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input: texts, dimensions: 1024 }),
      signal: AbortSignal.timeout(AI_CALL_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`embedding failed: ${res.status}`)
    const json = await res.json() as { data: { embedding: number[] }[] }
    return json.data.map(d => d.embedding)
  }
}
