'use client'

import { CATEGORY_LABELS, type Plan } from '@/lib/domain/schemas'

export function PlanConfirm({ plan, onConfirm, onCancel, disabled = false }: {
  plan: Plan
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}) {
  const categoryLabels = plan.focusCategories.map(category => CATEGORY_LABELS[category])
  const focusLabel = categoryLabels.length > 0 ? categoryLabels.join('、') : '未指定（全部类别）'
  const parserLabel = plan.parsedBy === 'llm' ? 'AI 解析' : '规则解析'

  return (
    <div role="dialog" aria-label="执行计划确认" className="plan-confirm">
      <p className="plan-confirm__summary">将分析 {plan.imageCount} 张图片</p>
      <p className="plan-confirm__line">任务理解：{plan.intentSummary || '按指令执行巡检'}</p>
      <p className="plan-confirm__line">重点关注：{focusLabel}</p>
      <p className="plan-confirm__note">
        仅影响视觉识别时的关注提示；其他类别仍会识别并保留，供人工复核。
      </p>
      {plan.steps.length > 0 && (
        <ol className="plan-confirm__steps" aria-label="执行步骤">
          {plan.steps.map((step, index) => (
            <li key={step.key} className="plan-confirm__step">
              <span className="plan-confirm__step-index" aria-hidden>{index + 1}</span>
              <div className="plan-confirm__step-body">
                <span className="plan-confirm__step-title">{step.title}</span>
                <span className="plan-confirm__step-detail">{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="plan-confirm__meta">
        {parserLabel} · 预计分析耗时约 {plan.estimatedSeconds} 秒，分析费用约 ¥{plan.estimatedCostCny.toFixed(2)}
      </p>
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
