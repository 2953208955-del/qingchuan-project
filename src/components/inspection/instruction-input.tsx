'use client'

export function InstructionInput({ value, onChange, disabled = false }: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  return (
    <label className="block text-sm">
      巡检指令
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        disabled={disabled}
        placeholder="例如：只统计塑料类，忽略水草"
        className="mt-1 w-full rounded-lg border border-border bg-background p-2 disabled:opacity-50"
      />
    </label>
  )
}
