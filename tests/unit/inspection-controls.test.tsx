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
    estimatedSeconds: 10,
    estimatedCostCny: 0.04,
    output: 'inspection_report' as const,
  }

  it('renders category labels and the cost estimate', () => {
    render(<PlanConfirm plan={{ ...plan, focusCategories: [...plan.focusCategories] }} onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText(/重点类别：塑料瓶、泡沫塑料/)).toBeInTheDocument()
    expect(screen.getByText(/费用约 ¥0.04/)).toBeInTheDocument()
  })

  it('disables both actions while another plan request is running', () => {
    render(<PlanConfirm plan={{ ...plan, focusCategories: [...plan.focusCategories] }} onConfirm={() => {}} onCancel={() => {}} disabled />)
    expect(screen.getByRole('button', { name: '开始巡检（确认执行计划）' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消执行计划' })).toBeDisabled()
  })
})
