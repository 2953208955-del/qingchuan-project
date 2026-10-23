'use client'

import { useState } from 'react'
import type { Clause } from '@/lib/domain/schemas'

type SearchResponse = { clauses?: unknown; noEvidence?: unknown }

export default function KnowledgePage() {
  const [query, setQuery] = useState('')
  const [clauses, setClauses] = useState<Clause[]>([])
  const [noEvidence, setNoEvidence] = useState(false)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed || searching) return

    setSearching(true)
    setError(null)
    setClauses([])
    setNoEvidence(false)
    setSearched(false)

    try {
      const res = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      })
      const data = await res.json().catch(() => null) as SearchResponse | null
      if (!res.ok) {
        const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
          ? data.message
          : `检索失败（${res.status}）`
        throw new Error(message)
      }

      const list = data && Array.isArray(data.clauses) ? data.clauses as Clause[] : []
      setClauses(list)
      setNoEvidence(Boolean(data?.noEvidence))
      setSearched(true)
    } catch (err) {
      setClauses([])
      setNoEvidence(false)
      setError(err instanceof Error ? err.message : '检索失败，请重试')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">知识库</h1>
      <form onSubmit={search} className="flex gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="例如：严重度如何分级"
          aria-label="检索问题"
          className="flex-1 rounded-lg border border-border bg-background p-2 text-sm"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          {searching ? '检索中…' : '检索'}
        </button>
      </form>

      {searching && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          正在检索标准条款…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {searched && noEvidence && (
        <p role="status" className="text-sm text-destructive">
          知识库中未找到依据。
        </p>
      )}

      {clauses.map(c => (
        <article key={c.id} className="rounded-lg border border-border p-3 text-sm">
          <div className="flex justify-between gap-3">
            <h2 className="text-xs font-medium">{c.standardNo} {c.clauseNo} · {c.title}</h2>
            {typeof c.score === 'number' && (
              <span className="shrink-0 text-xs text-muted-foreground">得分 {c.score.toFixed(3)}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{c.content}</p>
        </article>
      ))}
    </div>
  )
}
