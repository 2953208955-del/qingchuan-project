import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { clauses } from '../src/lib/db/schema'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { DashScopeReranker } from '../src/lib/rag/rerank'
import {
  DEFAULT_HYBRID_MIN_SCORE,
  DEFAULT_RERANK_MIN_SCORE,
  retrieveClauses,
} from '../src/lib/rag/retrieve'
import { parseRagQuestions } from '../src/lib/eval/rag-questions'
import { scoreRag, type RagScoredItem } from '../src/lib/eval/rag-score'
import { round, writeResults } from '../src/lib/eval/results'

const ROOT = process.cwd()
const SCOPED = process.argv.includes('--scoped')
const HELDOUT = process.argv.includes('--heldout') && !SCOPED
const QUESTION_FILE = path.resolve(
  ROOT,
  SCOPED
    ? 'tests/eval/rag-questions-heldout-scoped.json'
    : HELDOUT
      ? 'tests/eval/rag-questions-heldout.json'
      : 'tests/eval/rag-questions.json',
)
const SECTION = SCOPED ? 'ragScoped' : HELDOUT ? 'ragHeldout' : 'rag'
const MODE = SCOPED ? 'heldout-scoped' : HELDOUT ? 'heldout' : 'calibration'
const TOP_K = 5

function readQuestions() {
  if (!fs.existsSync(QUESTION_FILE)) {
    throw new Error(`找不到 RAG 评测题目：${QUESTION_FILE}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(QUESTION_FILE, 'utf8'))
  } catch (error) {
    throw new Error(
      `RAG 评测题目不是合法 JSON：${QUESTION_FILE}（错误：${error instanceof Error ? error.message : String(error)}）`,
    )
  }

  return parseRagQuestions(parsed)
}

// Clause numbers are only unique within a standard, so every match uses the
// full standardNo + clauseNo key.
function clauseKey(standardNo: string, clauseNo: string): string {
  return `${standardNo}#${clauseNo}`
}

async function main() {
  if (process.argv.includes('--dry-run')) {
    throw new Error(
      'RAG 评测不支持 --dry-run：dry-run 仅用于检测评测的匹配管线验证。' +
        '请直接运行 npm run eval:rag（需要 DASHSCOPE_API_KEY 和已 ingest 的知识库）。',
    )
  }

  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new Error('缺少 DASHSCOPE_API_KEY，无法运行真实 RAG 评测。请配置密钥后重试。')
  }

  const questions = readQuestions()
  const db = getDb()

  let clauseRows: { standardNo: string; clauseNo: string }[]
  try {
    clauseRows = db.select({ standardNo: clauses.standardNo, clauseNo: clauses.clauseNo }).from(clauses).all()
  } catch (error) {
    throw new Error(
      '无法读取知识库 clauses 表，数据库可能尚未初始化。' +
        `请先运行 npm run db:push，再运行 npm run ingest（详情：${error instanceof Error ? error.message : String(error)}）。`,
    )
  }
  if (clauseRows.length === 0) {
    throw new Error(
      '知识库没有任何条款（clauses 表为空），无法评测。' +
        '请先运行 npm run db:push，再运行 npm run ingest 写入种子语料后重试。',
    )
  }

  const allKeys = new Set(clauseRows.map(row => clauseKey(row.standardNo, row.clauseNo)))
  for (const [index, item] of questions.entries()) {
    if (!item.expectedStandardNo || !item.expectedClause) continue
    const key = clauseKey(item.expectedStandardNo, item.expectedClause)
    if (!allKeys.has(key)) {
      throw new Error(
        `RAG 评测题目第 ${index + 1} 题的期望条款 ${item.expectedStandardNo} ${item.expectedClause} 不在知识库中。` +
          '请检查 tests/eval/rag-questions.json 与已 ingest 的语料。',
      )
    }
  }

  const deps = {
    db,
    embedder: new DashScopeEmbedder(apiKey),
    reranker: new DashScopeReranker(apiKey),
  }

  const scored: RagScoredItem[] = []
  const details: {
    question: string
    expected: string | null
    expectNoEvidence: boolean
    noEvidence: boolean
    reranked: boolean
    hit: boolean
    retrieved: string[]
    scores: number[]
  }[] = []

  for (const [index, item] of questions.entries()) {
    let result
    try {
      result = await retrieveClauses(deps, item.question, [], TOP_K)
    } catch (error) {
      throw new Error(
        `RAG 第 ${index + 1} 题检索失败（${item.question}）：` +
          (error instanceof Error ? error.message : String(error)),
      )
    }

    const expectedKey = item.expectedStandardNo && item.expectedClause
      ? clauseKey(item.expectedStandardNo, item.expectedClause)
      : null
    const retrievedKeys = result.clauses.map(clause => clauseKey(clause.standardNo, clause.clauseNo))
    const hit = expectedKey === null
      ? result.noEvidence
      : retrievedKeys.includes(expectedKey)

    scored.push({ expectedKey, retrievedKeys, noEvidence: result.noEvidence })
    details.push({
      question: item.question,
      expected: expectedKey,
      expectNoEvidence: item.expectNoEvidence,
      noEvidence: result.noEvidence,
      reranked: result.reranked,
      hit,
      retrieved: result.clauses.map(clause => `${clause.standardNo} ${clause.clauseNo}`),
      scores: result.clauses.map(clause => round(clause.score)),
    })
  }

  const score = scoreRag(scored)
  const rag = {
    recallAt5: round(score.recallAt5),
    recallAt3: round(score.recallAt3),
    mrr: round(score.mrr),
    noAnswerAccuracy: round(score.noAnswerAccuracy),
    total: score.total,
    answerableTotal: score.answerableTotal,
    noAnswerTotal: score.noAnswerTotal,
    rerankThreshold: DEFAULT_RERANK_MIN_SCORE,
    hybridThreshold: DEFAULT_HYBRID_MIN_SCORE,
    rerankerFallbacks: details.filter(item => !item.reranked).length,
    details,
  }

  writeResults(SECTION, rag)
  console.log(JSON.stringify({
    [SECTION]: {
      recallAt5: rag.recallAt5,
      recallAt3: rag.recallAt3,
      mrr: rag.mrr,
      noAnswerAccuracy: rag.noAnswerAccuracy,
      total: rag.total,
      answerableTotal: rag.answerableTotal,
      noAnswerTotal: rag.noAnswerTotal,
      mode: MODE,
    },
  }, null, 2))
}

main().catch(error => {
  console.error(`RAG 评测失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
