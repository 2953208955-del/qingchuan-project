'use client'

import { useInspectionStore } from '@/stores/inspection-store'

export function EvidenceLink({
  type = 'detection',
  refId,
  children,
}: {
  type?: 'detection' | 'clause'
  refId: string
  children: React.ReactNode
}) {
  const setDetection = useInspectionStore(s => s.setSelectedDetection)
  const setClause = useInspectionStore(s => s.setSelectedClause)

  return (
    <button
      type="button"
      onClick={() => (type === 'detection' ? setDetection(refId) : setClause(refId))}
      className="rounded text-xs text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
    >
      {children}
    </button>
  )
}
