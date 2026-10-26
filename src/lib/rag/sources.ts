import { z } from 'zod'

export const KnowledgeSourceSchema = z.object({
  standardNo: z.string().min(1),
  title: z.string().min(1),
  version: z.string().min(1),
  sourceUrl: z.string().url().optional(),
  note: z.string().optional(),
})

export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>

const KnowledgeSourcesSchema = z.record(z.string(), KnowledgeSourceSchema)

/**
 * The manifest is the place that records where each knowledge document came
 * from. A malformed manifest must fail ingestion loudly instead of silently
 * publishing clauses under a wrong standard number.
 */
export function parseKnowledgeSources(raw: unknown): Record<string, KnowledgeSource> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('知识库来源清单必须是 JSON 对象')
  }
  return KnowledgeSourcesSchema.parse(raw)
}

export function resolveKnowledgeSource(
  file: string,
  sources: Record<string, KnowledgeSource>,
): KnowledgeSource {
  const registered = sources[file]
  if (registered) return registered

  // The seed SOP predates the manifest; keep only that one explicit legacy
  // fallback. Any other unregistered file must fail instead of entering the
  // database under an invented standard number.
  if (file === 'seed-sop.md') {
    return {
      standardNo: '清川SOP',
      title: '清川河湖垃圾巡检 SOP',
      version: '2026-10',
      note: '旧版种子 SOP；建议在 sources.json 中登记',
    }
  }

  throw new Error(
    `知识库文件未在 sources.json 中登记：${file}。请先登记 standardNo、title、version 与来源。`,
  )
}
