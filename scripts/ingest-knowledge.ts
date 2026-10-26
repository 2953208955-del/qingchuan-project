import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { ingestMarkdown } from '../src/lib/rag/ingest'
import { parseKnowledgeSources, resolveKnowledgeSource } from '../src/lib/rag/sources'

async function main() {
  const db = getDb()
  const embedder = new DashScopeEmbedder(process.env.DASHSCOPE_API_KEY ?? '')
  const dir = path.resolve('data/knowledge')
  const manifestPath = path.join(dir, 'sources.json')
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`缺少知识库来源清单：${manifestPath}`)
  }
  const sources = parseKnowledgeSources(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()

  let inserted = 0
  let replaced = 0
  const failed: string[] = []

  for (const file of files) {
    const fullPath = path.join(dir, file)
    try {
      const source = resolveKnowledgeSource(file, sources)
      const markdown = fs.readFileSync(fullPath, 'utf8')
      const result = await ingestMarkdown(db, embedder, {
        documentId: file.replace(/\.md$/, ''),
        standardNo: source.standardNo,
        title: source.title,
        markdown,
      })
      inserted += result.inserted
      replaced += result.replaced
      console.log(
        `${file} [${source.standardNo}]: +${result.inserted} inserted, ` +
          `${result.replaced} replaced, ${result.removed} removed`,
      )
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      failed.push(file)
      console.error(`failed to ingest ${fullPath}: ${reason}`)
    }
  }

  console.log(`done, inserted ${inserted}, replaced ${replaced}`)
  if (failed.length > 0) {
    console.error(`${failed.length} file(s) failed: ${failed.join(', ')}`)
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
