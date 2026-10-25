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
    <div role="dialog" aria-label="执行计划确认" className="plan-confirm">
      <p className="plan-confirm__summary">
        将分析 {plan.imageCount} 张图片，预计耗时约 {plan.estimatedSeconds} 秒，费用约 ¥{plan.estimatedCostCny.toFixed(2)}
      </p>
      {categoryLabels.length > 0 && <p className="plan-confirm__line">重点类别：{categoryLabels.join('、')}</p>}
      <p className="plan-confirm__hint">实际耗时与费用可能随模型响应略有浮动。</p>
      <div className="plan-confirm__actions">
        <button
          type="button"
          onClick={onConfirm}
          disabled={disabled}
          aria-label="开始巡检（确认执行计划）"
          className="holo-btn holo-btn--primary"
        >
          开始巡检
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={disabled}
          aria-label="取消执行计划"
          className="holo-btn holo-btn--ghost"
        >
          取消
        </button>
      </div>
    </div>
  )
}
