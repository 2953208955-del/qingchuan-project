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
})
