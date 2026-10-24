'use client'

import type { Clause } from '@/lib/domain/schemas'
import { useInspectionStore } from '@/stores/inspection-store'

export function ClausePanel({ clauses }: { clauses: Clause[] }) {
  const selectedClauseId = useInspectionStore(s => s.selectedClauseId)
  const setSelectedClause = useInspectionStore(s => s.setSelectedClause)

  if (clauses.length === 0) {
    return <p className="text-xs text-muted-foreground">知识库中未找到相关条款，本报告将不引用标准。</p>
  }

  return (
    <section aria-label="标准条款" className="space-y-2">
      {clauses.map(clause => {
        const selected = selectedClauseId === clause.id
        return (
          <article
            key={clause.id}
            data-clause-id={clause.id}
            aria-current={selected ? 'true' : undefined}
            className={`rounded-lg border border-border p-2 text-sm ${selected ? 'bg-accent/15' : ''}`}
          >
            {/* Clicking a clause identifies every claim that cites it. */}
            <button
              type="button"
              onClick={() => setSelectedClause(clause.id)}
              aria-pressed={selected}
              className="w-full text-left"
            >
              <h3 className="text-xs font-medium">
                {clause.standardNo} {clause.clauseNo} · {clause.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">{clause.content}</p>
            </button>
          </article>
        )
      })}
    </section>
  )
}
