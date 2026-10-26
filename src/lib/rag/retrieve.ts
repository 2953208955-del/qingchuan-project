import type { Db } from '@/lib/db/client'
import { clauses as clausesTable } from '@/lib/db/schema'
import type { Clause, DebrisCategory } from '@/lib/domain/schemas'
import type { Embedder } from './embed'
import type { Reranker } from './rerank'

export interface ChunkHit {
  id: string
  standardNo: string
  clauseNo: string
  title: string
  content: string
  categoryTags: string[]
  score: number
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('vector dimension mismatch')
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

const SYNONYMS: Record<string, string[]> = {
  '塑料瓶': ['饮料瓶', 'PET', '矿泉水瓶'],
  '塑料袋': ['包装袋', '马夹袋'],
  '渔网': ['渔具', '网具'],
  '水草': ['水生植物', '浮萍'],
}

export function expandQuery(query: string): string {
  const extras = Object.entries(SYNONYMS)
    .filter(([key]) => query.includes(key))
    .flatMap(([, values]) => values)
  return [query, ...extras].join(' ')
}

function bigrams(text: string): Set<string> {
  const compact = text.replace(/[\s，。；、：,.;:]/g, '')
  const set = new Set<string>()
  for (let i = 0; i < compact.length - 1; i++) set.add(compact.slice(i, i + 2))
  return set
}

export function lexicalScore(query: string, content: string): number {
  const q = bigrams(query)
  if (q.size === 0) return 0
  const c = bigrams(content)
  let hit = 0
  for (const term of q) if (c.has(term)) hit++
  return hit / q.size
}

export function searchChunks(db: Db, queryEmbedding: number[], queryText: string, k: number): ChunkHit[] {
  const rows = db.select().from(clausesTable).all()
  return rows
    .map(row => ({
      id: row.id,
      standardNo: row.standardNo,
      clauseNo: row.clauseNo,
      title: row.title,
      content: row.content,
      categoryTags: JSON.parse(row.categoryTags) as string[],
      score: 0.8 * cosine(queryEmbedding, JSON.parse(row.embeddingJson) as number[]) + 0.2 * lexicalScore(queryText, row.content),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// Reranked scores are calibrated on the expanded corpus: answerable questions
// scored >= 0.806 and no-answer probes <= 0.600, so 0.65 keeps a margin on both
// sides. Hybrid (no-reranker) scores are on a different scale; MCP and reranker
// outages use the lower threshold instead of silently discarding answers.
export const DEFAULT_RERANK_MIN_SCORE = 0.65
export const DEFAULT_HYBRID_MIN_SCORE = 0.45

export interface RetrievalResult {
  clauses: Clause[]
  noEvidence: boolean
  reranked: boolean
}

export async function retrieveClauses(
  deps: { db: Db; embedder: Embedder; reranker?: Reranker },
  query: string,
  categories: DebrisCategory[],
  topK = 5,
  minScore?: number,
): Promise<RetrievalResult> {
  const [embedding] = await deps.embedder.embed([expandQuery(query)])
  // Filter by category before truncating the pre-rerank pool: an eligible
  // clause must not be dropped just because many irrelevant categories rank
  // higher. Untagged clauses are general requirements that apply to every
  // category, so they stay eligible for category-scoped queries.
  let hits = searchChunks(deps.db, embedding, query, Number.MAX_SAFE_INTEGER)
    .filter(h =>
      categories.length === 0 ||
      h.categoryTags.length === 0 ||
      h.categoryTags.some(t => categories.includes(t as DebrisCategory)),
    )
    .slice(0, 20)

  let reranked = false
  if (deps.reranker && hits.length > 0) {
    try {
      const ranked = await deps.reranker.rerank(query, hits.map(h => h.content), Math.min(10, hits.length))
      if (ranked.length === 0) return { clauses: [], noEvidence: true, reranked: true }
      hits = ranked
        .filter(r => hits[r.index])
        .map(r => ({ ...hits[r.index], score: r.score }))
        .sort((a, b) => b.score - a.score)
      reranked = true
    } catch {
      // Reranker outage (HTTP/network): fall back to the hybrid hits and use
      // the hybrid threshold, not the stricter rerank threshold.
    }
  }

  const threshold = minScore ?? (reranked ? DEFAULT_RERANK_MIN_SCORE : DEFAULT_HYBRID_MIN_SCORE)
  const kept = hits.filter(h => h.score >= threshold).slice(0, topK)
  if (kept.length === 0) return { clauses: [], noEvidence: true, reranked }
  return {
    clauses: kept.map(h => ({
      id: h.id, standardNo: h.standardNo, clauseNo: h.clauseNo,
      title: h.title, content: h.content, score: h.score,
    })),
    noEvidence: false,
    reranked,
  }
}
