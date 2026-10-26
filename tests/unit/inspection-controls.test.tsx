// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { InstructionInput } from '@/components/inspection/instruction-input'
import { PlanConfirm } from '@/components/inspection/plan-confirm'
import { UploadDropzone } from '@/components/inspection/upload-dropzone'
import { useInspectionStore } from '@/stores/inspection-store'

vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => file),
}))

beforeEach(() => useInspectionStore.setState(useInspectionStore.getInitialState()))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('InspectionInput', () => {
  it('disables the instruction textarea while a plan request is running', () => {
    render(<InstructionInput value="统计塑料" onChange={() => {}} disabled />)
    expect(screen.getByRole('textbox', { name: '巡检指令' })).toBeDisabled()
  })
})

describe('UploadDropzone', () => {
  it('disables the file input when the parent is planning', () => {
    render(<UploadDropzone disabled />)
    expect(screen.getByLabelText('选择巡检图片')).toBeDisabled()
  })

  it('uploads a dropped file through the existing files path', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ filename: 'drop.png', path: 'data/uploads/drop.png', sha256: 'abc' }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['dropped'], 'drop.png', { type: 'image/png' })
    const { container } = render(<UploadDropzone />)
    const zone = container.querySelector('.upload-zone') as HTMLElement

    fireEvent.dragOver(zone, {
      dataTransfer: { files: [file], types: ['Files'], dropEffect: 'none' },
    })
    expect(zone).toHaveAttribute('data-drag-active', 'true')

    fireEvent.drop(zone, { dataTransfer: { files: [file] } })

    await waitFor(() => expect(useInspectionStore.getState().images).toHaveLength(1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(zone).not.toHaveAttribute('data-drag-active')
  })

  it('ignores drops while disabled', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['dropped'], 'drop.png', { type: 'image/png' })
    const { container } = render(<UploadDropzone disabled />)
    const zone = container.querySelector('.upload-zone') as HTMLElement

    fireEvent.dragOver(zone, {
      dataTransfer: { files: [file], types: ['Files'], dropEffect: 'none' },
    })
    expect(zone).not.toHaveAttribute('data-drag-active')

    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(useInspectionStore.getState().images).toHaveLength(0)
  })
})

describe('PlanConfirm', () => {
  const plan = {
    imageCount: 2,
    focusCategories: ['plastic_bottle', 'foam'] as const,
    intentSummary: '重点检查塑料类垃圾',
    steps: [
      { key: 'analyze' as const, title: '识别图片', detail: '分析 2 张图片，重点关注塑料瓶、泡沫塑料；其他类别仍会记录' },
      { key: 'aggregate' as const, title: '汇总与严重度', detail: '按代码公式汇总加权检出量、检出强度与严重度' },
      { key: 'retrieve' as const, title: '检索标准条款', detail: '检索清川 SOP 条款，并绑定到结论证据' },
      { key: 'draft' as const, title: '起草报告', detail: '由文本模型起草结论；每条结论必须绑定证据' },
      { key: 'verify' as const, title: '校验与复核', detail: '校验数字、证据与引用；低置信目标进入人工复核' },
    ],
    tools: ['create_work_order'] as const,
    planningTrace: [{
      tool: 'search_standards',
      input: { query: '塑料类', categories: [] },
      output: { noEvidence: false, clauses: [{}, {}] },
      latencyMs: 120,
    }],
    parsedBy: 'llm' as const,
    estimatedSeconds: 10,
    estimatedCostCny: 0.04,
    output: 'inspection_report' as const,
  }

  it('renders the parsed task, five steps, focus note and estimates', () => {
    render(<PlanConfirm plan={{ ...plan, focusCategories: [...plan.focusCategories], tools: [...plan.tools] }} onConfirm={() => {}} onCancel={() => {}} />)

    expect(screen.getByText(/任务理解：重点检查塑料类垃圾/)).toBeInTheDocument()
    expect(screen.getByText(/重点关注：塑料瓶、泡沫塑料/)).toBeInTheDocument()
    expect(screen.getByText(/其他类别仍会识别并保留，供人工复核/)).toBeInTheDocument()
    expect(screen.getByText(/额外工具：整改工单/)).toBeInTheDocument()
    expect(screen.getByText(/规划阶段工具/)).toBeInTheDocument()
    expect(screen.getByText(/2 条条款/)).toBeInTheDocument()
    for (const title of ['识别图片', '汇总与严重度', '检索标准条款', '起草报告', '校验与复核']) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
    expect(screen.getByText(/AI 解析/)).toBeInTheDocument()
    expect(screen.getByText(/费用约 ¥0.04/)).toBeInTheDocument()
  })

  it('labels the heuristic fallback honestly', () => {
    render(
      <PlanConfirm
        plan={{ ...plan, focusCategories: [], tools: [], planningTrace: [], parsedBy: 'heuristic' }}
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByText(/规则解析/)).toBeInTheDocument()
    expect(screen.getByText(/重点关注：未指定（全部类别）/)).toBeInTheDocument()
    expect(screen.queryByText(/额外工具：/)).not.toBeInTheDocument()
  })

  it('disables both actions while another plan request is running', () => {
    render(<PlanConfirm plan={{ ...plan, focusCategories: [...plan.focusCategories], tools: [...plan.tools] }} onConfirm={() => {}} onCancel={() => {}} disabled />)
    expect(screen.getByRole('button', { name: '开始巡检（确认执行计划）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消执行计划' })).toBeDisabled()
  })
})
