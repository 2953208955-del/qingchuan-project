import type { DebrisCategory } from '@/lib/domain/schemas'
import { retrieveClauses } from '@/lib/rag/retrieve'
import type { Db } from '@/lib/db/client'
import type { Embedder } from '@/lib/rag/embed'
import type { Reranker } from '@/lib/rag/rerank'
import type { RetrievalPort } from './types'

export class RagRetrievalAdapter implements RetrievalPort {
  constructor(
    private readonly db: Db,
    private readonly embedder: Embedder,
    private readonly reranker?: Reranker,
  ) {}

  async retrieve(query: string, categories: DebrisCategory[]) {
    return retrieveClauses({ db: this.db, embedder: this.embedder, reranker: this.reranker }, query, categories)
  }
}
