export interface RagQuestion {
  question: string
  expectedStandardNo: string | null
  expectedClause: string | null
  expectNoEvidence: boolean
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export function parseRagQuestions(raw: unknown): RagQuestion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('RAG 评测题目必须是非空数组')
  }

  return raw.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>
    const question = requiredString(record.question)
    if (!question) {
      throw new Error(`RAG 评测题目第 ${index + 1} 项的 question 必须是非空字符串`)
    }

    const expectNoEvidence = record.expectNoEvidence === true
    const expectedStandardNo = requiredString(record.expectedStandardNo)
    const expectedClause = requiredString(record.expectedClause)

    if (expectNoEvidence) {
      if (expectedStandardNo || expectedClause) {
        throw new Error(`RAG 评测题目第 ${index + 1} 项不能同时声明无答案和期望条款`)
      }
      return {
        question,
        expectedStandardNo: null,
        expectedClause: null,
        expectNoEvidence: true,
      }
    }

    if (!expectedStandardNo || !expectedClause) {
      throw new Error(
        `RAG 评测题目第 ${index + 1} 项必须同时提供 expectedStandardNo 和 expectedClause，` +
          '或设置 expectNoEvidence: true',
      )
    }

    return {
      question,
      expectedStandardNo,
      expectedClause,
      expectNoEvidence: false,
    }
  })
}
