import { create } from 'zustand'
import type { AgentStep, Clause, Detection, Plan, ReportDraft, UploadedImage } from '@/lib/domain/schemas'

interface InspectionState {
  runId: string | null
  images: UploadedImage[]
  plan: Plan | null
  steps: AgentStep[]
  detections: Detection[]
  clauses: Clause[]
  report: ReportDraft | null
  selectedDetectionId: string | null
  selectedClaimId: string | null
  selectedClauseId: string | null
  setRunId: (id: string | null) => void
  setImages: (images: UploadedImage[]) => void
  addImages: (images: UploadedImage[]) => void
  setPlan: (plan: Plan | null) => void
  addStep: (step: AgentStep) => void
  upsertStep: (step: AgentStep) => void
  setDetections: (d: Detection[]) => void
  setClauses: (c: Clause[]) => void
  setReport: (r: ReportDraft | null) => void
  setSelectedDetection: (id: string | null) => void
  setSelectedClaim: (id: string | null) => void
  setSelectedClause: (id: string | null) => void
  reset: () => void
}

export const useInspectionStore = create<InspectionState>((set) => ({
  runId: null, images: [], plan: null, steps: [], detections: [], clauses: [], report: null,
  selectedDetectionId: null, selectedClaimId: null, selectedClauseId: null,
  setRunId: runId => set({ runId }),
  setImages: images => set({ images }),
  addImages: images => set(s => ({ images: [...s.images, ...images] })),
  setPlan: plan => set({ plan }),
  addStep: step => set(s => ({ steps: [...s.steps, step] })),
  upsertStep: step => set(s => ({
    steps: s.steps.some(x => x.id === step.id) ? s.steps.map(x => x.id === step.id ? step : x) : [...s.steps, step],
  })),
  setDetections: detections => set({ detections }),
  setClauses: clauses => set({ clauses }),
  setReport: report => set({ report }),
  setSelectedDetection: selectedDetectionId => set({ selectedDetectionId }),
  setSelectedClaim: selectedClaimId => set({ selectedClaimId }),
  setSelectedClause: selectedClauseId => set({ selectedClauseId }),
  reset: () => set({
    runId: null, images: [], plan: null, steps: [], detections: [], clauses: [],
    report: null, selectedDetectionId: null, selectedClaimId: null, selectedClauseId: null,
  }),
}))
