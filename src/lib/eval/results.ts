import fs from 'node:fs'
import path from 'node:path'

export type EvalSection = 'detection' | 'rag' | 'agent'

export type ResultsDocument = {
  generatedAt?: string
  detection?: unknown
  rag?: unknown
  agent?: unknown
  [key: string]: unknown
}

export function defaultResultsPath(): string {
  return path.resolve('data/eval/results.json')
}

// A missing file means "no evaluation has run yet". A present but corrupt file
// is an error: silently dropping it would erase previously reported evidence.
export function readResults(file: string = defaultResultsPath()): ResultsDocument {
  if (!fs.existsSync(file)) return {}
  const raw = fs.readFileSync(file, 'utf8')
  if (raw.trim() === '') return {}

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`评测结果文件不是合法 JSON，请检查或删除后重试：${file}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`评测结果文件顶层必须是 JSON 对象：${file}`)
  }
  return parsed as ResultsDocument
}

// Merge one section into the existing document. The write goes to a sibling
// temp file first and is then renamed over the target, so readers never see a
// half-written file and a crash cannot truncate earlier sections.
export function writeResults(
  section: EvalSection,
  value: unknown,
  file: string = defaultResultsPath(),
): ResultsDocument {
  const document: ResultsDocument = {
    ...readResults(file),
    [section]: value,
    generatedAt: new Date().toISOString(),
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temp, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    fs.renameSync(temp, file)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    throw error
  }
  return document
}
