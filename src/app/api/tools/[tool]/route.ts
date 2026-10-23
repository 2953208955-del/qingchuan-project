import { NextResponse } from 'next/server'
import { assertAllowedTool } from '@/lib/safety/tools'
import { computeSeverityTool, createWorkOrderTool } from '@/lib/agent/tools'

export const runtime = 'nodejs'

export async function POST(request: Request, { params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params
  try {
    assertAllowedTool(tool)
    const input = await request.json()
    if (tool === 'computeSeverity') return NextResponse.json(computeSeverityTool(input))
    if (tool === 'createWorkOrder') return NextResponse.json(await createWorkOrderTool(input))
    return NextResponse.json({ code: 'NOT_IMPLEMENTED', message: '工具需要通过内部依赖调用', retryable: false }, { status: 501 })
  } catch (error) {
    return NextResponse.json({ code: 'TOOL_ERROR', message: (error as Error).message, retryable: false }, { status: 400 })
  }
}
