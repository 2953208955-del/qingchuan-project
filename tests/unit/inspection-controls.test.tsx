// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { InstructionInput } from '@/components/inspection/instruction-input'
import { PlanConfirm } from '@/components/inspection/plan-confirm'
import { UploadDropzone } from '@/components/inspection/upload-dropzone'
import { useInspectionStore } from '@/stores/inspection-store'

beforeEach(() => useInspectionStore.setState(useInspectionStore.getInitialState()))
afterEach(() => cleanup())

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
