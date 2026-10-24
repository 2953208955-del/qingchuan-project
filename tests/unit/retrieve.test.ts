import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { cosine, expandQuery, lexicalScore, searchChunks, retrieveClauses } from '@/lib/rag/retrieve'

function dbWithChunks() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  db.insert(clauses).values([
    { id: 'c1', documentId: 'd', standardNo: 'SOP', clauseNo: '第2条', title: '类别', content: '塑料瓶属于塑料类', categoryTags: '["plastic_bottle"]', embeddingJson: '[1,0,0]' },
    { id: 'c2', documentId: 'd', standardNo: 'SOP', clauseNo: '第3条', title: '分级', content: '按加权检出量分级', categoryTags: '[]', embeddingJson: '[0,1,0]' },
  ]).run()
  return db
}

function dbWithCategoryOutliers() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  const noise = Array.from({ length: 21 }, (_, i) => ({
    id: `noise-${i}`,
    documentId: 'd',
    standardNo: 'SOP',
    clauseNo: `第${i + 10}条`,
    title: '噪声',
    content: `无关内容${i}`,
    categoryTags: '["metal"]',
    embeddingJson: '[1,0,0]',
  }))
  db.insert(clauses).values([
    ...noise,
    {
      id: 'in-category', documentId: 'd', standardNo: 'SOP', clauseNo: '第99条',
      title: '类别', content: '塑料瓶属于塑料类',
      categoryTags: '["plastic_bottle"]', embeddingJson: '[0,1,0]',
    },
  ]).run()
  return db
}

function dbWithUntaggedGeneral() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  // More than the 20-candidate pool of category-tagged noise, all ranking
  // higher than the untagged clause.
  const noise = Array.from({ length: 22 }, (_, i) => ({
    id: `noise-${i}`,
    documentId: 'd',
    standardNo: 'SOP',
    clauseNo: `第${i + 10}条`,
    title: '噪声',
    content: `无关内容${i}`,
    categoryTags: '["metal"]',
    embeddingJson: '[1,0,0]',
  }))
  db.insert(clauses).values([
    ...noise,
    {
      id: 'general', documentId: 'd', standardNo: 'SOP', clauseNo: '第1条',
      title: '总则', content: '塑料瓶等漂浮垃圾的通用巡检与处置要求',
      // Ranks below all 22 category-tagged noise rows: proves the filter runs
      // before the 20-candidate truncation.
      categoryTags: '[]', embeddingJson: '[0.5,0.5,0]',
    },
  ]).run()
  return db
}

const fakeEmbedder = { embed: async () => [[1, 0, 0]] }

describe('retrieval', () => {
  it('computes cosine similarity', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })

  it('expands synonyms for Chinese queries', () => {
    expect(expandQuery('塑料瓶')).toContain('PET')
  })

  it('scores lexical overlap', () => {
    expect(lexicalScore('塑料瓶', '塑料瓶属于塑料类')).toBeGreaterThan(0)
  })

  it('returns the nearest chunk first', () => {
    const db = dbWithChunks()
    const hits = searchChunks(db, [1, 0, 0], '塑料瓶', 2)
    expect(hits[0].id).toBe('c1')
  })

  it('returns noEvidence when the best score is below threshold', async () => {
    const db = dbWithChunks()
    const result = await retrieveClauses({ db, embedder: fakeEmbedder }, '火星上的垃圾', [], 5, 0.9)
    expect(result.noEvidence).toBe(true)
    expect(result.clauses).toEqual([])
  })

  it('returns clauses above threshold', async () => {
    const db = dbWithChunks()
    const result = await retrieveClauses({ db, embedder: fakeEmbedder }, '塑料瓶', [], 5, 0.5)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses[0].id).toBe('c1')
  })

  it('applies reranker indices and sorts by score', async () => {
    const db = dbWithChunks()
    const reranker = {
      rerank: async () => [
        { index: 0, score: 0.4 },
        { index: 1, score: 0.99 },
      ],
    }
    const result = await retrieveClauses({ db, embedder: fakeEmbedder, reranker }, '塑料瓶', [], 5, 0.3)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses.map(c => c.id)).toEqual(['c2', 'c1'])
    expect(result.clauses.map(c => c.score)).toEqual([0.99, 0.4])
  })

  it('fails closed when the reranker returns no results', async () => {
    const db = dbWithChunks()
    const reranker = { rerank: async () => [] }
    const result = await retrieveClauses({ db, embedder: fakeEmbedder, reranker }, '塑料瓶', [], 5, 0.1)
    expect(result.noEvidence).toBe(true)
    expect(result.clauses).toEqual([])
  })

  it('falls back to hybrid hits when the reranker throws', async () => {
    const db = dbWithChunks()
    const reranker = {
      rerank: async () => {
        throw new Error('reranker offline')
      },
    }
    const result = await retrieveClauses({ db, embedder: fakeEmbedder, reranker }, '塑料瓶', [], 5, 0.5)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses.map(c => c.id)).toEqual(['c1'])
  })

  it('returns only clauses matching the requested categories', async () => {
    const db = dbWithChunks()
    const result = await retrieveClauses({ db, embedder: fakeEmbedder }, '塑料瓶', ['plastic_bottle'], 5, 0.1)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses.map(c => c.id)).toEqual(['c1'])
  })

  it('filters categories before truncating the candidate pool', async () => {
    const db = dbWithCategoryOutliers()
    const result = await retrieveClauses({ db, embedder: fakeEmbedder }, '塑料瓶', ['plastic_bottle'], 5, 0.1)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses.map(c => c.id)).toEqual(['in-category'])
  })

  it('keeps untagged general clauses eligible for a category-scoped query', async () => {
    const db = dbWithUntaggedGeneral()
    const result = await retrieveClauses({ db, embedder: fakeEmbedder }, '塑料瓶', ['plastic_bottle'], 5, 0.1)
    expect(result.noEvidence).toBe(false)
    expect(result.clauses.map(c => c.id)).toContain('general')
  })
})
