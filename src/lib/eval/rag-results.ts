export interface RagResults {
  recallAt5: number
  recallAt3: number
  mrr: number
  noAnswerAccuracy: number
  total: number
  answerableTotal: number
  noAnswerTotal: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export function parseRagResults(value: unknown): RagResults | null {
  const record = asRecord(value)
  if (!record || !isNumber(record.recallAt5) || !isNumber(record.total)) return null

  const optional = (key: string) => isNumber(record[key]) ? record[key] : 0

  return {
    recallAt5: record.recallAt5,
    recallAt3: optional('recallAt3'),
    mrr: optional('mrr'),
    noAnswerAccuracy: optional('noAnswerAccuracy'),
    total: record.total,
    answerableTotal: optional('answerableTotal'),
    noAnswerTotal: optional('noAnswerTotal'),
  }
}
