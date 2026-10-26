import { describe, expect, it } from 'vitest'
import { scoreRag, type RagScoredItem } from '@/lib/eval/rag-score'

describe('scoreRag', () => {
  it('scores recall, MRR and no-answer accuracy separately', () => {
    const items: RagScoredItem[] = [
      { expectedKey: 'SOP#第1条', retrievedKeys: ['SOP#第1条', 'SOP#第2条'], noEvidence: false },
      { expectedKey: 'SOP#第2条', retrievedKeys: ['SOP#第3条', 'SOP#第4条', 'SOP#第2条'], noEvidence: false },
      { expectedKey: 'CJJ#5.2', retrievedKeys: ['CJJ#6.1'], noEvidence: false },
      { expectedKey: null, retrievedKeys: [], noEvidence: true },
      { expectedKey: null, retrievedKeys: ['SOP#第1条'], noEvidence: false },
    ]

    const score = scoreRag(items)

    expect(score.total).toBe(5)
    expect(score.answerableTotal).toBe(3)
    expect(score.noAnswerTotal).toBe(2)
    expect(score.recallAt5).toBeCloseTo(2 / 3)
    expect(score.recallAt3).toBeCloseTo(2 / 3)
    expect(score.mrr).toBeCloseTo((1 + 1 / 3) / 3)
    expect(score.noAnswerAccuracy).toBeCloseTo(0.5)
  })

  it('does not count a hit at rank 6 as Recall@5', () => {
    const score = scoreRag([{
      expectedKey: 'SOP#第1条',
      retrievedKeys: ['A', 'B', 'C', 'D', 'E', 'SOP#第1条'],
      noEvidence: false,
    }])

    expect(score.recallAt5).toBe(0)
    expect(score.recallAt3).toBe(0)
    expect(score.mrr).toBeCloseTo(1 / 6)
  })

  it('does not divide by zero when a slice is empty', () => {
    const score = scoreRag([
      { expectedKey: 'SOP#第1条', retrievedKeys: ['SOP#第1条'], noEvidence: false },
    ])

    expect(score.answerableTotal).toBe(1)
    expect(score.noAnswerTotal).toBe(0)
    expect(score.noAnswerAccuracy).toBe(0)
    expect(Number.isFinite(score.mrr)).toBe(true)
  })

  it('returns zeros for an empty question set', () => {
    expect(scoreRag([])).toEqual({
      total: 0,
      answerableTotal: 0,
      noAnswerTotal: 0,
      recallAt5: 0,
      recallAt3: 0,
      mrr: 0,
      noAnswerAccuracy: 0,
    })
  })
})
