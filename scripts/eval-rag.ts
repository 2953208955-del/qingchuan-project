import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { clauses } from '../src/lib/db/schema'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { DashScopeReranker } from '../src/lib/rag/rerank'
import { retrieveClauses } from '../src/lib/rag/retrieve'
import { round, writeResults } from '../src/lib/eval/results'

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

// Clause numbers are only unique within a standard, so a hit must match the
// full standardNo + clauseNo key.
function clauseKey(standardNo: string, clauseNo: string): string {
  return JSON.stringify([standardNo, clauseNo])
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

  const expectedKeys = new Map<string, Set<string>>()
  for (const row of clauseRows) {
    const keys = expectedKeys.get(row.clauseNo) ?? new Set<string>()
    keys.add(clauseKey(row.standardNo, row.clauseNo))
    expectedKeys.set(row.clauseNo, keys)
  }
  for (const [index, item] of questions.entries()) {
    const keys = expectedKeys.get(item.expectedClause)
    if (!keys) {
      throw new Error(
        `RAG 评测题目第 ${index + 1} 题的 expectedClause "${item.expectedClause}" 不在知识库中。` +
          '请检查 tests/eval/rag-questions.json 与已 ingest 的语料（先运行 npm run db:push，再运行 npm run ingest）。',
      )
    }
    if (keys.size > 1) {
      throw new Error(
        `RAG 评测题目第 ${index + 1} 题的 expectedClause "${item.expectedClause}" 在知识库中对应多个标准，` +
          '无法按 standardNo + clauseNo 唯一匹配。请只 ingest 评测所用的语料，或先消除标准冲突。',
      )
    }
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
    const expected = expectedKeys.get(item.expectedClause)!
    const hit = result.clauses.some(clause => expected.has(clauseKey(clause.standardNo, clause.clauseNo)))
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
