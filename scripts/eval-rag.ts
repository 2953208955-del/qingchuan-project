import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { clauses } from '../src/lib/db/schema'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { DashScopeReranker } from '../src/lib/rag/rerank'
import { retrieveClauses } from '../src/lib/rag/retrieve'
import { writeResults } from '../src/lib/eval/results'

type Question = { question: string; expectedClause: string }

const ROOT = process.cwd()
const QUESTION_FILE = path.resolve(ROOT, 'tests/eval/rag-questions.json')
const TOP_K = 5

function readQuestions(): Question[] {
  if (!fs.existsSync(QUESTION_FILE)) {
    throw new Error(`找不到 RAG 评测题目：${QUESTION_FILE}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(QUESTION_FILE, 'utf8'))
  } catch (error) {
    throw new Error(`RAG 评测题目不是合法 JSON：${QUESTION_FILE}（${error instanceof Error ? error.message : String(error)}）`)
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`RAG 评测题目必须是非空数组：${QUESTION_FILE}`)
  }

  return parsed.map((entry, index) => {
    const record = (entry ?? {}) as Record<string, unknown>
    if (typeof record.question !== 'string' || record.question.trim() === '') {
      throw new Error(`RAG 评测题目第 ${index + 1} 项的 question 必须是非空字符串`)
    }
    if (typeof record.expectedClause !== 'string' || record.expectedClause.trim() === '') {
      throw new Error(`RAG 评测题目第 ${index + 1} 项的 expectedClause 必须是非空字符串`)
    }
    return { question: record.question.trim(), expectedClause: record.expectedClause.trim() }
  })
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

async function main() {
  const apiKey = process.env.DASHSCOPE_API_KEY?.trim() ?? ''
  if (!apiKey) {
    throw new Error('缺少 DASHSCOPE_API_KEY，无法运行真实 RAG 评测。请配置密钥后重试。')
  }

  const questions = readQuestions()
  const db = getDb()

  let clauseCount: number
  try {
    clauseCount = db.select({ id: clauses.id }).from(clauses).all().length
  } catch (error) {
    throw new Error(
      '无法读取知识库 clauses 表，数据库可能尚未初始化。' +
        `请先运行 npm run db:push，再运行 npm run ingest（详情：${error instanceof Error ? error.message : String(error)}）。`,
    )
  }
  if (clauseCount === 0) {
    throw new Error(
      '知识库没有任何条款（clauses 表为空），无法评测。' +
        '请先运行 npm run db:push，再运行 npm run ingest 写入种子语料后重试。',
    )
  }

  const deps = {
    db,
    embedder: new DashScopeEmbedder(apiKey),
    reranker: new DashScopeReranker(apiKey),
  }

  let hits = 0
  const details: { question: string; expected: string; hit: boolean; retrieved: string[] }[] = []
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
    const hit = result.clauses.some(clause => clause.clauseNo === item.expectedClause)
    if (hit) hits++
    details.push({
      question: item.question,
      expected: item.expectedClause,
      hit,
      retrieved: result.clauses.map(clause => `${clause.standardNo} ${clause.clauseNo}`),
    })
  }

  const rag = {
    recallAt5: round(hits / questions.length),
    total: questions.length,
    details,
  }

  writeResults('rag', rag)
  console.log(JSON.stringify({ rag: { recallAt5: rag.recallAt5, total: rag.total } }, null, 2))
}

main().catch(error => {
  console.error(`RAG 评测失败：${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
