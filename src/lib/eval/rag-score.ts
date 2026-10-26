export interface RagScoredItem {
  // "standardNo#clauseNo" for answerable questions; null for no-answer probes.
  expectedKey: string | null
  retrievedKeys: string[]
  noEvidence: boolean
}

export interface RagScore {
  total: number
  answerableTotal: number
  noAnswerTotal: number
  recallAt5: number
  recallAt3: number
  mrr: number
  noAnswerAccuracy: number
}

/**
 * Answerable questions and no-answer probes measure different things, so they
 * are scored on separate denominators instead of being averaged into a single
 * misleading "accuracy".
 */
export function scoreRag(items: RagScoredItem[]): RagScore {
  let answerableTotal = 0
  let noAnswerTotal = 0
  let hitAt5 = 0
  let hitAt3 = 0
  let reciprocalRankSum = 0
  let noAnswerCorrect = 0

  for (const item of items) {
    if (item.expectedKey === null) {
      noAnswerTotal++
      if (item.noEvidence) noAnswerCorrect++
      continue
    }

    answerableTotal++
    const rank = item.retrievedKeys.indexOf(item.expectedKey)
    if (rank >= 0) {
      if (rank < 5) hitAt5++
      reciprocalRankSum += 1 / (rank + 1)
      if (rank < 3) hitAt3++
    }
  }

  return {
    total: items.length,
    answerableTotal,
    noAnswerTotal,
    recallAt5: answerableTotal > 0 ? hitAt5 / answerableTotal : 0,
    recallAt3: answerableTotal > 0 ? hitAt3 / answerableTotal : 0,
    mrr: answerableTotal > 0 ? reciprocalRankSum / answerableTotal : 0,
    // If there are no no-answer probes, do not report a fake perfect score.
    noAnswerAccuracy: noAnswerTotal > 0 ? noAnswerCorrect / noAnswerTotal : 0,
  }
}
