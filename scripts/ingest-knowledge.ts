import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../src/lib/db/client'
import { DashScopeEmbedder } from '../src/lib/rag/embed'
import { ingestMarkdown } from '../src/lib/rag/ingest'

async function main() {
  const db = getDb()
  const embedder = new DashScopeEmbedder(process.env.DASHSCOPE_API_KEY ?? '')
  const dir = path.resolve('data/knowledge')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()

  let inserted = 0
  let replaced = 0
  const failed: string[] = []

  for (const file of files) {
    const fullPath = path.join(dir, file)
    try {
      const markdown = fs.readFileSync(fullPath, 'utf8')
      const result = await ingestMarkdown(db, embedder, {
        documentId: file.replace(/\.md$/, ''),
        standardNo: file.includes('sop') ? '清川SOP' : file,
        title: file,
        markdown,
      })
      inserted += result.inserted
      replaced += result.replaced
      console.log(`${file}: +${result.inserted} inserted, ${result.replaced} replaced`)
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
