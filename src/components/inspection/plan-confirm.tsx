'use client'

import { CATEGORY_LABELS, type Plan } from '@/lib/domain/schemas'

export function PlanConfirm({ plan, onConfirm, onCancel, disabled = false }: {
  plan: Plan
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const categoryLabels = plan.focusCategories.map(category => CATEGORY_LABELS[category])

  return (
    <div role="dialog" aria-label="执行计划确认" className="rounded-xl border border-border p-4">
      <h2 className="font-medium">执行计划</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        将分析 {plan.imageCount} 张图片，预计耗时约 {plan.estimatedSeconds} 秒，费用约 ¥{plan.estimatedCostCny.toFixed(2)}
      </p>
      {categoryLabels.length > 0 && <p className="mt-1 text-sm">重点类别：{categoryLabels.join('、')}</p>}
      <p className="mt-1 text-xs text-muted-foreground">实际耗时与费用可能随模型响应略有浮动。</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          aria-label="开始巡检（确认执行计划）"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          开始巡检
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          aria-label="取消执行计划"
          className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  )
}
