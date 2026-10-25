'use client'

import { useInspectionStore } from '@/stores/inspection-store'

export function EvidenceLink({
  type = 'detection',
  refId,
  active = false,
  children,
}: {
  type?: 'detection' | 'clause'
  refId: string
  active?: boolean
  children: React.ReactNode
}) {
  const setDetection = useInspectionStore(s => s.setSelectedDetection)
  const setClause = useInspectionStore(s => s.setSelectedClause)

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => (type === 'detection' ? setDetection(refId) : setClause(refId))}
      className="holo-chip"
    >
      {children}
    </button>
  )
}
