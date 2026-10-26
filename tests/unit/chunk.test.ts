import { describe, it, expect } from 'vitest'
import { chunkMarkdown } from '@/lib/rag/chunk'

const md = `# 巡检 SOP
## 第1条 适用范围
适用于河湖岸线巡检。
## 第2条 垃圾类别
塑料瓶、塑料袋、渔网渔具等。
## 第3条 严重度分级
按加权检出量分为低、中、高。`

describe('chunkMarkdown', () => {
  it('splits by clause headings', () => {
    const chunks = chunkMarkdown(md, { standardNo: '清川SOP', documentId: 'doc1', title: '巡检 SOP' })
    expect(chunks).toHaveLength(3)
    expect(chunks[1].clauseNo).toBe('第2条')
    expect(chunks[1].content).toContain('塑料瓶')
  })

  it('accepts excerpt ids for clauses that are not official clause numbers', () => {
    const chunks = chunkMarkdown(
      '## 摘编-CJJ-4.0.2 保洁等级\n按水域重要性分级。',
      { standardNo: 'CJJ/T 174-2013', documentId: 'cjj', title: '摘编' },
    )
    expect(chunks).toHaveLength(1)
    expect(chunks[0].clauseNo).toBe('摘编-CJJ-4.0.2')
  })

  it('keeps category tags from content', () => {
    const chunks = chunkMarkdown(md, { standardNo: '清川SOP', documentId: 'doc1', title: '巡检 SOP' })
    expect(chunks[1].categoryTags).toContain('plastic_bottle')
  })

  it('returns empty for a document without clause headings', () => {
    expect(chunkMarkdown('# 空文档\n没有条款', { standardNo: 'X', documentId: 'd', title: 'x' })).toEqual([])
  })
})
