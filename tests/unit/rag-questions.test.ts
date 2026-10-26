import { describe, expect, it } from 'vitest'
import { parseRagQuestions } from '@/lib/eval/rag-questions'

describe('parseRagQuestions', () => {
  it('accepts answerable and no-answer questions', () => {
    const questions = parseRagQuestions([
      {
        question: '水面垃圾按什么等级控制？',
        expectedStandardNo: 'CJJ/T 174-2013',
        expectedClause: '第6.1.1条',
      },
      {
        question: '火星上的垃圾怎么分类？',
        expectNoEvidence: true,
      },
    ])

    expect(questions).toHaveLength(2)
    expect(questions[0]).toMatchObject({
      expectedStandardNo: 'CJJ/T 174-2013',
      expectedClause: '第6.1.1条',
      expectNoEvidence: false,
    })
    expect(questions[1]).toMatchObject({
      expectedStandardNo: null,
      expectedClause: null,
      expectNoEvidence: true,
    })
  })

  it('rejects a non-array or empty question set', () => {
    expect(() => parseRagQuestions({})).toThrow()
    expect(() => parseRagQuestions([])).toThrow()
  })

  it('rejects an empty question', () => {
    expect(() => parseRagQuestions([
      { question: '  ', expectNoEvidence: true },
    ])).toThrow()
  })

  it('rejects an expected clause without its standard', () => {
    expect(() => parseRagQuestions([
      { question: '测试', expectedClause: '第1条' },
    ])).toThrow()
  })

  it('rejects mixing a no-answer flag with an expected clause', () => {
    expect(() => parseRagQuestions([
      {
        question: '测试',
        expectedStandardNo: 'SOP',
        expectedClause: '第1条',
        expectNoEvidence: true,
      },
    ])).toThrow()
  })
})
