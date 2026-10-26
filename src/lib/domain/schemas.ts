import { z } from 'zod'

export const DebrisCategory = z.enum([
  'plastic_bottle', 'plastic_bag', 'foam', 'fishing_gear',
  'metal', 'glass', 'paper', 'textile', 'other', 'natural',
])
export type DebrisCategory = z.infer<typeof DebrisCategory>

export const Severity = z.enum(['low', 'medium', 'high'])
export type Severity = z.infer<typeof Severity>

export const CATEGORY_LABELS: Record<DebrisCategory, string> = {
  plastic_bottle: '塑料瓶', plastic_bag: '塑料袋', foam: '泡沫塑料',
  fishing_gear: '渔网渔具', metal: '金属', glass: '玻璃',
  paper: '纸类', textile: '织物', other: '其他', natural: '自然漂浮物',
}

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: '低', medium: '中', high: '高',
}

export const BBox = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
}).refine(b => b.x + b.w <= 1.0001 && b.y + b.h <= 1.0001, 'bbox out of bounds')
export type BBox = z.infer<typeof BBox>

export const Detection = z.object({
  id: z.string(),
  imageId: z.string(),
  category: DebrisCategory,
  material: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  bbox: BBox.nullable(),
  description: z.string().max(500),
  source: z.enum(['vlm', 'detector', 'manual']),
  reviewStatus: z.enum(['pending', 'confirmed', 'rejected', 'corrected']).default('pending'),
})
export type Detection = z.infer<typeof Detection>

export const Clause = z.object({
  id: z.string(),
  standardNo: z.string(),
  clauseNo: z.string(),
  title: z.string(),
  content: z.string(),
  score: z.number().default(0),
})
export type Clause = z.infer<typeof Clause>

export const EvidenceRef = z.object({
  id: z.string(),
  type: z.enum(['detection', 'clause', 'metric']),
  refId: z.string(),
  label: z.string(),
})
export type EvidenceRef = z.infer<typeof EvidenceRef>

export const ReportClaim = z.object({
  id: z.string(),
  section: z.enum(['summary', 'findings', 'severity', 'recommendations', 'limitations']),
  text: z.string().min(1),
  evidenceIds: z.array(z.string()).min(1),
})
export type ReportClaim = z.infer<typeof ReportClaim>

export const ReportDraft = z.object({
  title: z.string(),
  location: z.string().nullable(),
  inspectedAt: z.string(),
  // Provenance is code-authoritative: AI runs write 'ai'; the seeded demo writes
  // 'manual' so the UI never presents hand-built data as live model output.
  // Optional for reports stored before provenance existed.
  source: z.enum(['ai', 'manual']).optional(),
  claims: z.array(ReportClaim).min(1),
  metrics: z.object({
    imageCount: z.number().int().nonnegative(),
    detectionCount: z.number().int().nonnegative(),
    weightedTotal: z.number().nonnegative(),
    intensity: z.number().nonnegative(),
    severity: Severity,
    formulaVersion: z.string(),
  }),
  citations: z.array(z.object({ standardNo: z.string(), clauseNo: z.string() })),
  modelInfo: z.object({ textModel: z.string(), visionModel: z.string(), promptVersion: z.string() }),
  limitations: z.array(z.string()),
})
export type ReportDraft = z.infer<typeof ReportDraft>

export const PlanStep = z.object({
  key: z.enum(['analyze', 'aggregate', 'retrieve', 'draft', 'verify']),
  title: z.string(),
  detail: z.string(),
})
export type PlanStep = z.infer<typeof PlanStep>

export const Plan = z.object({
  imageCount: z.number().int().positive(),
  focusCategories: z.array(DebrisCategory).default([]),
  intentSummary: z.string().default(''),
  steps: z.array(PlanStep).default([]),
  parsedBy: z.enum(['llm', 'heuristic']).default('heuristic'),
  estimatedSeconds: z.number().positive(),
  estimatedCostCny: z.number().nonnegative(),
  output: z.literal('inspection_report'),
})
export type Plan = z.infer<typeof Plan>

export const RunStatus = z.enum([
  'idle', 'planning', 'planned', 'analyzing', 'aggregating', 'retrieving',
  'drafting', 'verifying', 'awaiting_review', 'completed', 'failed', 'stale',
])
export type RunStatus = z.infer<typeof RunStatus>

export const ReportStatus = z.enum(['draft', 'needs_review', 'stale'])
export type ReportStatus = z.infer<typeof ReportStatus>

export const AgentStep = z.object({
  id: z.string(),
  runId: z.string(),
  step: z.string(),
  status: z.enum(['pending', 'running', 'done', 'error', 'skipped']),
  toolName: z.string().nullable(),
  detail: z.string().nullable(),
  latencyMs: z.number().nullable(),
  costCny: z.number().nullable(),
})
export type AgentStep = z.infer<typeof AgentStep>

export const UploadedImage = z.object({
  id: z.string(),
  filename: z.string(),
  path: z.string(),
  sha256: z.string(),
  status: z.enum(['pending', 'analyzed', 'failed']),
})
export type UploadedImage = z.infer<typeof UploadedImage>
