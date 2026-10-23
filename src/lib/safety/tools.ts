export const ALLOWED_TOOLS = [
  'analyzeImage', 'searchStandards', 'computeSeverity',
  'draftReport', 'verifyReport', 'createWorkOrder',
] as const

export type AllowedTool = typeof ALLOWED_TOOLS[number]

export function assertAllowedTool(name: string): asserts name is AllowedTool {
  if (!ALLOWED_TOOLS.includes(name as AllowedTool)) {
    throw new Error(`不允许调用的工具: ${name}`)
  }
}
