import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { chunkMarkdown } from '@/lib/rag/chunk'
import { parseKnowledgeSources, resolveKnowledgeSource } from '@/lib/rag/sources'

const dir = path.resolve('data/knowledge')
const sources = parseKnowledgeSources(
  JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8')),
)
const files = fs.readdirSync(dir).filter(file => file.endsWith('.md')).sort()

describe('knowledge corpus', () => {
  it('registers every source document and keeps clause numbers unique per document', () => {
    expect(files.length).toBeGreaterThanOrEqual(3)

    for (const file of files) {
      expect(sources[file], `${file} missing from sources.json`).toBeDefined()
      const source = resolveKnowledgeSource(file, sources)
      const chunks = chunkMarkdown(fs.readFileSync(path.join(dir, file), 'utf8'), {
        documentId: file.replace(/\.md$/, ''),
        standardNo: source.standardNo,
        title: source.title,
      })
      expect(chunks.length).toBeGreaterThan(0)
      expect(new Set(chunks.map(chunk => chunk.clauseNo)).size).toBe(chunks.length)
    }
  })

  it('has exact per-document counts and external source notes', () => {
    const expectedCounts: Record<string, number> = {
      'seed-sop.md': 6,
      'cjjt174-2013.md': 15,
      'db31-t1639-2025.md': 10,
      'gbt19095-2019.md': 8,
    }

    let total = 0
    for (const [file, expectedCount] of Object.entries(expectedCounts)) {
      const source = resolveKnowledgeSource(file, sources)
      const chunks = chunkMarkdown(fs.readFileSync(path.join(dir, file), 'utf8'), {
        documentId: file.replace(/\.md$/, ''),
        standardNo: source.standardNo,
        title: source.title,
      })
      expect(chunks, file).toHaveLength(expectedCount)
      total += chunks.length

      for (const chunk of chunks) {
        expect(chunk.content.length).toBeGreaterThan(20)
        // The project-authored SOP is sourced through sources.json; external
        // standards must additionally carry a visible per-clause source note
        // naming the same standard, and exact clause IDs must match the note.
        if (file !== 'seed-sop.md') {
          expect(chunk.content, `${file} ${chunk.clauseNo}`).toContain('来源')
          expect(chunk.content, `${file} ${chunk.clauseNo}`).toContain(source.standardNo)
          if (chunk.clauseNo.startsWith('第')) {
            expect(
              chunk.content.replace(/\s/g, ''),
              `${file} ${chunk.clauseNo} source note mismatch`,
            ).toContain(chunk.clauseNo)
          }
        }
      }
    }

    expect(total).toBe(39)
  })
})
