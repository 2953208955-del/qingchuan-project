import { describe, it, expect, beforeEach } from 'vitest'
import { useInspectionStore } from '@/stores/inspection-store'
import type { AgentStep, Detection, UploadedImage } from '@/lib/domain/schemas'

const step = (overrides: Partial<AgentStep> = {}): AgentStep => ({
  id: 's1',
  runId: 'r1',
  step: 'plan',
  status: 'done',
  toolName: null,
  detail: null,
  latencyMs: 10,
  costCny: 0,
  ...overrides,
})

const image = (id: string): UploadedImage => ({
  id,
  filename: `${id}.jpg`,
  path: `/data/uploads/${id}.jpg`,
  sha256: `sha-${id}`,
  status: 'pending',
})

describe('inspection store', () => {
  beforeEach(() => useInspectionStore.setState(useInspectionStore.getInitialState()))

  it('sets a plan and selection', () => {
    const s = useInspectionStore.getState()
    s.setPlan({
      imageCount: 3, focusCategories: [], intentSummary: '检查河岸垃圾',
      steps: [], parsedBy: 'heuristic', estimatedSeconds: 20, estimatedCostCny: 0.2,
      output: 'inspection_report',
    })
    s.setSelectedDetection('d1')
    expect(useInspectionStore.getState().plan?.imageCount).toBe(3)
    expect(useInspectionStore.getState().selectedDetectionId).toBe('d1')
  })

  it('appends steps and resets', () => {
    const s = useInspectionStore.getState()
    s.addStep(step())
    expect(useInspectionStore.getState().steps).toHaveLength(1)
    s.reset()
    expect(useInspectionStore.getState().steps).toHaveLength(0)
  })

  it('upsertStep replaces an existing step instead of duplicating it', () => {
    const s = useInspectionStore.getState()
    s.addStep(step({ status: 'running', latencyMs: null }))
    s.addStep(step({ id: 's2', step: 'vision' }))
    s.upsertStep({ ...step(), status: 'done', latencyMs: 42 })

    const steps = useInspectionStore.getState().steps
    expect(steps).toHaveLength(2)
    expect(steps[0]).toMatchObject({ id: 's1', status: 'done', latencyMs: 42 })
    expect(steps[1].id).toBe('s2')
  })

  it('upsertStep appends a step that does not exist yet', () => {
    useInspectionStore.getState().upsertStep(step({ id: 'new', step: 'aggregate' }))
    expect(useInspectionStore.getState().steps.map(s => s.id)).toEqual(['new'])
  })

  it('addImages appends to the existing image list', () => {
    const s = useInspectionStore.getState()
    s.setImages([image('a')])
    s.addImages([image('b'), image('c')])
    expect(useInspectionStore.getState().images.map(i => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('reset clears selections and run data', () => {
    const s = useInspectionStore.getState()
    s.setRunId('r1')
    s.setImages([image('a')])
    s.setPlan({
      imageCount: 1, focusCategories: [], intentSummary: '检查河岸垃圾',
      steps: [], parsedBy: 'heuristic', estimatedSeconds: 5, estimatedCostCny: 0.02,
      output: 'inspection_report',
    })
    s.addStep(step())
    const detection = {
      id: 'd1', imageId: 'a', category: 'plastic_bottle', material: null, confidence: 0.9,
      bbox: null, description: '塑料瓶', source: 'vlm', reviewStatus: 'pending',
    } satisfies Detection
    s.setDetections([detection])
    s.setClauses([{ id: 'c1', standardNo: 'SL/T 1-2020', clauseNo: '4.1', title: '标题', content: '内容', score: 0.5 }])
    s.setReport(null)
    s.setSelectedDetection('d1')
    s.setSelectedClaim('claim1')
    s.setSelectedClause('c1')

    s.reset()

    const after = useInspectionStore.getState()
    expect(after.runId).toBeNull()
    expect(after.images).toEqual([])
    expect(after.plan).toBeNull()
    expect(after.steps).toEqual([])
    expect(after.detections).toEqual([])
    expect(after.clauses).toEqual([])
    expect(after.report).toBeNull()
    expect(after.selectedDetectionId).toBeNull()
    expect(after.selectedClaimId).toBeNull()
    expect(after.selectedClauseId).toBeNull()
  })
})
