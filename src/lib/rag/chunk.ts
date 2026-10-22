import crypto from 'node:crypto'
import type { DebrisCategory } from '@/lib/domain/schemas'

export interface ChunkDraft {
  id: string
  standardNo: string
  clauseNo: string
  title: string
  content: string
  categoryTags: DebrisCategory[]
}

const CATEGORY_KEYWORDS: [DebrisCategory, string[]][] = [
  ['plastic_bottle', ['塑料瓶', '饮料瓶', 'PET']],
  ['plastic_bag', ['塑料袋', '包装袋']],
  ['foam', ['泡沫']],
  ['fishing_gear', ['渔网', '渔具', '鱼线']],
  ['metal', ['金属', '易拉罐']],
  ['glass', ['玻璃', '酒瓶']],
  ['paper', ['纸类', '纸盒']],
  ['textile', ['织物', '衣物']],
]

export function chunkMarkdown(
  markdown: string,
  meta: { standardNo: string; documentId: string; title: string },
): ChunkDraft[] {
  const lines = markdown.split(/\r?\n/)
  const chunks: ChunkDraft[] = []
  let current: { clauseNo: string; title: string; body: string[] } | null = null

  const flush = () => {
    if (!current) return
    const content = current.body.join('\n').trim()
    if (!content) return
    const tags = CATEGORY_KEYWORDS
      .filter(([, words]) => words.some(w => content.includes(w)))
      .map(([cat]) => cat)
    chunks.push({
      id: crypto.createHash('sha1').update(`${meta.documentId}:${current.clauseNo}`).digest('hex').slice(0, 16),
      standardNo: meta.standardNo,
      clauseNo: current.clauseNo,
      title: current.title,
      content,
      categoryTags: tags,
    })
  }

  for (const line of lines) {
    const match = line.match(/^##\s*(第[^\s]+条)\s*(.*)$/)
    if (match) {
      flush()
      current = { clauseNo: match[1], title: match[2].trim() || match[1], body: [] }
    } else if (current) {
      current.body.push(line)
    }
  }
  flush()
  return chunks
}
