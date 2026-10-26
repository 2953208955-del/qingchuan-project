import { describe, expect, it } from 'vitest'
import { parseRagResults } from '@/lib/eval/rag-results'

describe('parseRagResults', () => {
  it('parses the extended result fields', () => {
    const result = parseRagResults({
      recallAt5: 0.9,
      recallAt3: 0.8,
      mrr: 0.75,
      noAnswerAccuracy: 0.7,
      total: 50,
      answerableTotal: 40,
      noAnswerTotal: 10,
    })

    expect(result).toEqual({
      recallAt5: 0.9,
      recallAt3: 0.8,
      mrr: 0.75,
      noAnswerAccuracy: 0.7,
      total: 50,
      answerableTotal: 40,
      noAnswerTotal: 10,
    })
  })

  it('accepts legacy results with only recallAt5 and total', () => {
    expect(parseRagResults({ recallAt5: 1, total: 35 })).toMatchObject({
      recallAt5: 1,
      total: 35,
      recallAt3: 0,
      mrr: 0,
      noAnswerAccuracy: 0,
    })
  })

  it('rejects malformed results', () => {
    expect(parseRagResults(null)).toBeNull()
    expect(parseRagResults({ recallAt5: '1', total: 35 })).toBeNull()
  })
})
