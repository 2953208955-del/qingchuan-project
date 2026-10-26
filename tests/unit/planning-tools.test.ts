import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { searchStandardsForPlanning } from '@/lib/agent/planner'

function dbWithClause() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  db.insert(clauses).values({
    id: 'c1',
    documentId: 'd',
    standardNo: '清川SOP',
    clauseNo: '第2条',
    title: '垃圾类别',
    content: '塑料瓶属于塑料类垃圾',
    categoryTags: '["plastic_bottle"]',
    embeddingJson: '[1,0,0]',
  }).run()
  return db
}

describe('searchStandardsForPlanning', () => {
  it('returns the clauses found by the shared retrieval path', async () => {
    const result = await searchStandardsForPlanning(
      { db: dbWithClause(), embedder: { embed: async () => [[1, 0, 0]] } },
      { query: '塑料瓶', categories: ['plastic_bottle'] },
    )

    expect(result.noEvidence).toBe(false)
    expect(result.clauses[0]).toMatchObject({
      standardNo: '清川SOP',
      clauseNo: '第2条',
    })
  })

  it('returns noEvidence for an unrelated query', async () => {
    const result = await searchStandardsForPlanning(
      { db: dbWithClause(), embedder: { embed: async () => [[0, 1, 0]] } },
      { query: '火星上的垃圾', categories: [] },
    )

    expect(result.noEvidence).toBe(true)
    expect(result.clauses).toEqual([])
  })
})
