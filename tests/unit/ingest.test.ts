import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import fs from 'node:fs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Db } from '@/lib/db/client'
import { createDb } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { ingestMarkdown, IngestError } from '@/lib/rag/ingest'

const fakeEmbedder = { embed: async (texts: string[]) => texts.map((_, i) => [i + 1, 0, 0]) }

function freshDb(): Db {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: path.resolve('drizzle') })
  return db
}

function seedMarkdown(): string {
  return fs.readFileSync(path.resolve('data/knowledge/seed-sop.md'), 'utf8')
}

function seedInput(markdown: string) {
  return { documentId: 'sop', standardNo: '清川SOP', title: '巡检 SOP', markdown }
}

describe('ingestMarkdown', () => {
  it('inserts chunks and is idempotent', async () => {
    const db = freshDb()
    const md = seedMarkdown()

    const first = await ingestMarkdown(db, fakeEmbedder, seedInput(md))
    expect(first).toEqual({ inserted: 6, replaced: 0, removed: 0 })

    const second = await ingestMarkdown(db, fakeEmbedder, seedInput(md))
    expect(second).toEqual({ inserted: 0, replaced: 0, removed: 0 })
    expect(db.select().from(clauses).all()).toHaveLength(6)
  })

  it('replaces a clause when its content changes', async () => {
    const db = freshDb()
    const original = seedMarkdown()
    await ingestMarkdown(db, fakeEmbedder, seedInput(original))

    const changed = original.replace(
      '水草、树叶等自然漂浮物不计入垃圾统计。',
      '水草、树叶等自然漂浮物不计入垃圾统计，但需单独记录。',
    )
    expect(changed).not.toBe(original)

    const result = await ingestMarkdown(db, fakeEmbedder, seedInput(changed))
    expect(result).toEqual({ inserted: 0, replaced: 1, removed: 0 })

    const rows = db.select().from(clauses).all()
    expect(rows).toHaveLength(6)
    const clause2 = rows.find(row => row.clauseNo === '第2条')
    expect(clause2?.content).toContain('但需单独记录')
  })

  it('removes clauses that were deleted or renumbered', async () => {
    const db = freshDb()
    const firstMd = '## 第1条 甲\n内容一\n\n## 第2条 乙\n内容二'
    const secondMd = '## 第1条 甲\n内容一\n\n## 第3条 丙\n内容三'

    await ingestMarkdown(db, fakeEmbedder, seedInput(firstMd))
    const result = await ingestMarkdown(db, fakeEmbedder, seedInput(secondMd))

    expect(result).toEqual({ inserted: 1, replaced: 0, removed: 1 })
    const rows = db.select().from(clauses).all()
    expect(rows.map(row => row.clauseNo).sort()).toEqual(['第1条', '第3条'])
  })

  it('throws IngestError for duplicate clauseNo and writes nothing', async () => {
    const db = freshDb()
    const embedder = vi.fn(fakeEmbedder.embed)
    const markdown = '## 第1条 甲\n内容一\n\n## 第2条 乙\n内容二\n\n## 第1条 丙\n内容三'

    const error = await ingestMarkdown(db, { embed: embedder }, seedInput(markdown)).catch(err => err)
    expect(error).toBeInstanceOf(IngestError)
    expect((error as Error).message).toContain('duplicate clauseNo: 第1条')
    expect(embedder).not.toHaveBeenCalled()
    expect(db.select().from(clauses).all()).toHaveLength(0)
  })

  it('throws IngestError when no clause headings are found', async () => {
    const db = freshDb()
    const markdown = '# 空文档\n没有条款标题'

    const error = await ingestMarkdown(db, fakeEmbedder, seedInput(markdown)).catch(err => err)
    expect(error).toBeInstanceOf(IngestError)
    expect((error as Error).message).toContain('## 第N条')
    expect((error as Error).message).toContain('## 第N条 标题')
    expect(db.select().from(clauses).all()).toHaveLength(0)
  })
})
