import { ReportDraft } from '@/lib/domain/schemas'
import type { VerifyIssue } from '@/lib/domain/evidence'
import type { ReportContext, ReporterPort } from './types'
import { generateJson } from '@/lib/ai/generate-json'
import { getTextModel } from '@/lib/ai/providers'
import { BudgetTracker, estimateCostCny } from '@/lib/ai/budget'
import { REPORTER_PROMPT, PROMPT_VERSIONS } from '@/lib/ai/prompts'

function textModelName(): string {
  return process.env.TEXT_MODEL ?? 'deepseek-chat'
}

/**
 * Code is the authority for metrics, model provenance, inspection time and
 * location. Everything the model supplies for those fields is discarded so a
 * hallucinated number or place can never reach the report. The remaining model
 * content (title, claims, citations, limitations) must still be a valid
 * ReportDraft; claims without evidence are rejected here.
 */
export function parseReportWithMetrics(raw: unknown, context: ReportContext): ReportDraft {
  const obj = (raw ?? {}) as Record<string, unknown>
  return ReportDraft.parse({
    ...obj,
    location: context.location,
    inspectedAt: context.inspectedAt,
    metrics: context.metrics,
    modelInfo: {
      textModel: textModelName(),
      visionModel: process.env.VISION_MODEL ?? 'qwen2.5-vl-max-latest',
      promptVersion: PROMPT_VERSIONS.reporter,
    },
  })
}

function promptFor(context: ReportContext, issues?: VerifyIssue[]) {
  return JSON.stringify({
    instruction: context.instruction,
    location: context.location,
    inspectedAt: context.inspectedAt,
    metrics: context.metrics,
    evidence: [
      { id: 'metric:overall', type: 'metric', label: `严重度 ${context.metrics.severity}，检出强度 ${context.metrics.intensity}` },
      ...context.detections.map(d => ({
        id: `detection:${d.id}`, type: 'detection',
        label: `${d.category}，置信度 ${Math.round(d.confidence * 100)}%`,
      })),
      ...context.clauses.map(c => ({
        id: `clause:${c.id}`, type: 'clause',
        label: `[${c.standardNo} ${c.clauseNo}] ${c.title}`,
      })),
    ],
    detections: context.detections.map(d => ({
      id: d.id, category: d.category, confidence: d.confidence, description: d.description,
    })),
    clauses: context.clauses.map(c => ({
      standardNo: c.standardNo, clauseNo: c.clauseNo, title: c.title, content: c.content,
    })),
    issues: issues ?? [],
  })
}

const ReportModelOutput = ReportDraft.omit({ metrics: true, modelInfo: true })

export class DeepSeekReportGenerator implements ReporterPort {
  constructor(private readonly opts: { budget?: BudgetTracker } = {}) {}

  private charge(usage: { inputTokens: number; outputTokens: number }): void {
    // BudgetExceededError deliberately propagates: callers must abort the run.
    this.opts.budget?.add(estimateCostCny(textModelName(), usage))
  }

  async draft(context: ReportContext): Promise<ReportDraft> {
    const result = await generateJson({
      model: getTextModel(),
      schema: ReportModelOutput,
      system: REPORTER_PROMPT,
      prompt: promptFor(context),
    })
    this.charge(result.usage)
    return parseReportWithMetrics(result.value, context)
  }

  async repair(context: ReportContext, issues: VerifyIssue[]): Promise<ReportDraft> {
    const result = await generateJson({
      model: getTextModel(),
      schema: ReportModelOutput,
      system: REPORTER_PROMPT,
      prompt: promptFor(context, issues),
    })
    this.charge(result.usage)
    return parseReportWithMetrics(result.value, context)
  }
}
