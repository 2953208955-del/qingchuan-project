import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { createInMemoryPlanningMcpClient } from '@/lib/agent/mcp-client'

function dbWithClause() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  db.insert(clauses).values({
    id: 'c1',
    documentId: 'sop',
    standardNo: '清川SOP',
    clauseNo: '第2条',
    title: '垃圾类别',
    content: '塑料瓶属于塑料类垃圾',
    categoryTags: '["plastic_bottle"]',
    embeddingJson: '[1,0,0]',
  }).run()
  return db
}

describe('planning MCP client', () => {
  it('calls search_standards through the MCP protocol', async () => {
    const client = await createInMemoryPlanningMcpClient({
      db: dbWithClause(),
      embedder: { embed: async () => [[1, 0, 0]] },
      reranker: { rerank: async () => [{ index: 0, score: 0.95 }] },
    })

    try {
      const result = await client.searchStandards({
        query: '塑料瓶属于哪类垃圾？',
        categories: ['plastic_bottle'],
      })
      expect(result.noEvidence).toBe(false)
      expect(result.clauses[0]).toMatchObject({
        standardNo: '清川SOP',
        clauseNo: '第2条',
      })
    } finally {
      await client.close()
    }
  })

  it('returns noEvidence for an unrelated query', async () => {
    const client = await createInMemoryPlanningMcpClient({
      db: dbWithClause(),
      embedder: { embed: async () => [[0, 1, 0]] },
      reranker: { rerank: async () => [{ index: 0, score: 0.2 }] },
    })

    try {
      const result = await client.searchStandards({
        query: '火星上的垃圾怎么分类？',
        categories: [],
      })
      expect(result.noEvidence).toBe(true)
    } finally {
      await client.close()
    }
  })
})
