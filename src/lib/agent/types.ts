import type { Db } from '@/lib/db/client'
import type { Clause, DebrisCategory, Detection, ReportDraft } from '@/lib/domain/schemas'
import type { EvidenceIndex, VerifyIssue } from '@/lib/domain/evidence'
import type { VisionPort } from '@/lib/vision/qwen'
import type { BudgetTracker } from '@/lib/ai/budget'

export interface RetrievalPort {
  retrieve(query: string, categories: DebrisCategory[]): Promise<{ clauses: Clause[]; noEvidence: boolean }>
}

export interface ReportContext {
  runId: string
  instruction: string
  location: string | null
  inspectedAt: string
  detections: Detection[]
  metrics: ReportDraft['metrics']
  clauses: Clause[]
}

export interface ReporterPort {
  draft(context: ReportContext): Promise<ReportDraft>
  repair(context: ReportContext, issues: VerifyIssue[]): Promise<ReportDraft>
}

export interface VerifierPort {
  verify(report: ReportDraft, index: EvidenceIndex): { passed: boolean; issues: VerifyIssue[] }
}

export interface AgentEvent {
  type: 'step' | 'done' | 'error'
  runId: string
  step?: { id: string; step: string; status: string; toolName: string | null; detail: string | null; latencyMs: number | null; costCny: number | null }
  status?: string
  message?: string
}

export interface OrchestratorDeps {
  db: Db
  repo: typeof import('@/lib/db/repo')
  vision: VisionPort
  retrieval: RetrievalPort
  reporter: ReporterPort
  verifier: VerifierPort
  budget: BudgetTracker
  emit: (event: AgentEvent) => void
  now: () => Date
}
