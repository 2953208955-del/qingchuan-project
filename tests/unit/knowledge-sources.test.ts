import { describe, expect, it } from 'vitest'
import { parseKnowledgeSources, resolveKnowledgeSource } from '@/lib/rag/sources'

const manifest = parseKnowledgeSources({
  'seed-sop.md': {
    standardNo: '清川SOP',
    title: '清川河湖垃圾巡检 SOP',
    version: '2026-10',
    note: '项目自编',
  },
  'cjjt174-2013.md': {
    standardNo: 'CJJ/T 174-2013',
    title: '城市水域保洁作业及质量标准',
    version: '2013',
    sourceUrl: 'https://example.com/cjjt174',
  },
})

describe('knowledge sources', () => {
  it('resolves metadata for a known file', () => {
    expect(resolveKnowledgeSource('cjjt174-2013.md', manifest)).toMatchObject({
      standardNo: 'CJJ/T 174-2013',
      title: '城市水域保洁作业及质量标准',
      version: '2013',
    })
  })

  it('allows only the legacy seed SOP to fall back', () => {
    expect(resolveKnowledgeSource('seed-sop.md', {})).toMatchObject({
      standardNo: '清川SOP',
    })
    expect(() => resolveKnowledgeSource('other.md', manifest)).toThrow(/sources\.json/)
  })

  it('rejects a manifest entry without the required source fields', () => {
    expect(() => parseKnowledgeSources({
      'bad.md': { standardNo: 'X', title: 'Bad' },
    })).toThrow()
  })

  it('rejects a non-object manifest', () => {
    expect(() => parseKnowledgeSources([])).toThrow()
  })
})
