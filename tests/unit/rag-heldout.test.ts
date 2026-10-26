import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseRagQuestions } from '@/lib/eval/rag-questions'

function read(name: string) {
  return parseRagQuestions(
    JSON.parse(fs.readFileSync(path.resolve('tests/eval', name), 'utf8')),
  )
}

describe('held-out RAG set', () => {
  const calibration = read('rag-questions.json')
  const heldout = read('rag-questions-heldout.json')

  it('is a separate, non-empty set with answerable and no-answer probes', () => {
    expect(heldout.length).toBeGreaterThanOrEqual(30)
    expect(heldout.filter(item => !item.expectNoEvidence).length).toBeGreaterThanOrEqual(20)
    expect(heldout.filter(item => item.expectNoEvidence).length).toBeGreaterThanOrEqual(10)
  })

  it('does not reuse calibration-set questions', () => {
    const calibrationQuestions = new Set(calibration.map(item => item.question))
    const duplicates = heldout.filter(item => calibrationQuestions.has(item.question))
    expect(duplicates).toEqual([])
  })

  it('targets the newly added excerpt clauses', () => {
    const excerptTargets = heldout.filter(
      item => item.expectedClause?.startsWith('摘编-'),
    )
    expect(excerptTargets.length).toBeGreaterThanOrEqual(15)
  })
})
