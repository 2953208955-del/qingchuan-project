'use client'

import type { Ref } from 'react'

export function InstructionInput({ value, onChange, disabled = false, textareaRef }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  textareaRef?: Ref<HTMLTextAreaElement>
}) {
  return (
    <label className="block">
      <span className="holo-label">巡检指令</span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        placeholder="例如：只统计塑料类，忽略水草"
        className="holo-input mt-2"
      />
    </label>
  )
}
