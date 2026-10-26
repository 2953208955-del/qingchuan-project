import { and, eq, inArray } from 'drizzle-orm'
import type { Db } from '@/lib/db/client'
import { clauses } from '@/lib/db/schema'
import { chunkMarkdown, type ChunkDraft } from './chunk'
import type { Embedder } from './embed'

export class IngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestError'
  }
}

export interface IngestInput {
  documentId: string
  standardNo: string
  title: string
  markdown: string
}

export interface IngestResult {
  inserted: number
  replaced: number
  removed: number
}

type ClauseRow = typeof clauses.$inferSelect

function embeddingText(chunk: ChunkDraft): string {
  return `${chunk.title}\n${chunk.content}`
}

export async function ingestMarkdown(
  db: Db,
  embedder: Embedder,
  input: IngestInput,
): Promise<IngestResult> {
  const chunks = chunkMarkdown(input.markdown, input)
  if (chunks.length === 0) {
    throw new IngestError(
      `document "${input.documentId}" contains no clauses: no "## 第N条" headings found; ` +
        'required heading convention is "## 第N条 标题"',
    )
  }

  const seen = new Set<string>()
  for (const chunk of chunks) {
    if (seen.has(chunk.clauseNo)) {
      throw new IngestError(`duplicate clauseNo: ${chunk.clauseNo} (document "${input.documentId}")`)
    }
    seen.add(chunk.clauseNo)
  }

  const existing = db.select().from(clauses).where(eq(clauses.documentId, input.documentId)).all()
  const existingByClauseNo = new Map<string, ClauseRow>(existing.map(row => [row.clauseNo, row]))
  const currentClauseNos = new Set(chunks.map(chunk => chunk.clauseNo))
  // Renumbered or deleted clauses must not linger after re-ingestion.
  const stale = existing.filter(row => !currentClauseNos.has(row.clauseNo))

  const toInsert: ChunkDraft[] = []
  const toReplace: { chunk: ChunkDraft; row: ClauseRow }[] = []

  for (const chunk of chunks) {
    const row = existingByClauseNo.get(chunk.clauseNo)
    if (!row) {
      toInsert.push(chunk)
      continue
    }
    const unchanged =
      row.standardNo === chunk.standardNo &&
      row.title === chunk.title &&
      row.content === chunk.content &&
      row.categoryTags === JSON.stringify(chunk.categoryTags)
    if (!unchanged) toReplace.push({ chunk, row })
  }

  const pending = [...toInsert, ...toReplace.map(entry => entry.chunk)]
  let embeddings: number[][] = []
  if (pending.length > 0) {
    embeddings = await embedder.embed(pending.map(embeddingText))
    if (embeddings.length !== pending.length) {
      throw new IngestError(
        `embedder returned ${embeddings.length} embeddings for ${pending.length} chunks`,
      )
    }
  }
  const insertEmbeddings = embeddings.slice(0, toInsert.length)
  const replaceEmbeddings = embeddings.slice(toInsert.length)

  db.transaction(tx => {
    if (stale.length > 0) {
      tx.delete(clauses)
        .where(and(
          eq(clauses.documentId, input.documentId),
          inArray(clauses.clauseNo, stale.map(row => row.clauseNo)),
        ))
        .run()
    }

    if (toInsert.length > 0) {
      tx.insert(clauses)
        .values(
          toInsert.map((chunk, i) => ({
            id: chunk.id,
            documentId: input.documentId,
            standardNo: chunk.standardNo,
            clauseNo: chunk.clauseNo,
            title: chunk.title,
            content: chunk.content,
            categoryTags: JSON.stringify(chunk.categoryTags),
            embeddingJson: JSON.stringify(insertEmbeddings[i]),
          })),
        )
        .run()
    }

    toReplace.forEach(({ chunk, row }, i) => {
      tx.update(clauses)
        .set({
          standardNo: chunk.standardNo,
          title: chunk.title,
          content: chunk.content,
          categoryTags: JSON.stringify(chunk.categoryTags),
          embeddingJson: JSON.stringify(replaceEmbeddings[i]),
        })
        .where(eq(clauses.id, row.id))
        .run()
    })
  })

  return { inserted: toInsert.length, replaced: toReplace.length, removed: stale.length }
}
