'use client'

import { useState } from 'react'
import type { Clause } from '@/lib/domain/schemas'
import { HoloBadge } from '@/components/holo/holo-badge'

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
    <div className="knowledge-page">
      <header className="knowledge-hero">
        <p className="holo-eyebrow">QINGCHUAN · KNOWLEDGE BASE</p>
        <h1>知识库</h1>
      </header>

      <form onSubmit={search} className="knowledge-search" role="search">
        <span className="knowledge-search__prompt" aria-hidden>›</span>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="例如：严重度如何分级"
          aria-label="检索问题"
          className="holo-input knowledge-search__input"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="holo-btn holo-btn--primary knowledge-search__submit"
        >
          {searching ? '检索中…' : '检索'}
        </button>
      </form>

      {searching && (
        <p role="status" aria-live="polite" className="knowledge-status knowledge-status--searching">
          正在检索标准条款…
        </p>
      )}
      {error && (
        <p role="alert" className="knowledge-alert">
          {error}
        </p>
      )}
      {searched && noEvidence && (
        <p role="status" className="knowledge-status knowledge-status--empty">
          知识库中未找到依据。
        </p>
      )}

      {clauses.length > 0 && (
        <section className="knowledge-results" aria-label="标准条款检索结果">
          {clauses.map(c => (
            <article key={c.id} className="knowledge-clause">
              <div className="knowledge-clause__head">
                <h2 className="knowledge-clause__title">{c.standardNo} {c.clauseNo} · {c.title}</h2>
                {typeof c.score === 'number' && (
                  <HoloBadge tone="muted" className="knowledge-clause__score">
                    得分 {c.score.toFixed(3)}
                  </HoloBadge>
                )}
              </div>
              <p className="knowledge-clause__body">{c.content}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}
