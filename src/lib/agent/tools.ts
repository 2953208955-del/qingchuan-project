import { z } from 'zod'
import { computeSeverity } from '@/lib/domain/severity'
import { Detection } from '@/lib/domain/schemas'
import { assertAllowedTool } from '@/lib/safety/tools'
import { createInspectionTools } from './tool-registry'

export const ComputeSeverityInput = z.object({
  detections: z.array(Detection),
  imageCount: z.number().int().positive(),
})

export const CreateWorkOrderInput = z.object({
  runId: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
})

export function computeSeverityTool(input: unknown) {
  assertAllowedTool('computeSeverity')
  const parsed = ComputeSeverityInput.parse(input)
  return computeSeverity(parsed.detections, parsed.imageCount)
}

export async function createWorkOrderTool(input: unknown) {
  assertAllowedTool('createWorkOrder')
  const parsed = CreateWorkOrderInput.parse(input)
  return createInspectionTools().createWorkOrder(parsed)
}
