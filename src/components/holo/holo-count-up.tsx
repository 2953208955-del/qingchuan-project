'use client'

import { useEffect, useState } from 'react'

type HoloCountUpProps = {
  value: number
  label: string
  decimals?: number
  suffix?: string
  className?: string
}

function formatValue(value: number, decimals: number, suffix: string): string {
  return `${value.toFixed(decimals)}${suffix}`
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true
  }

  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function HoloCountUp({
  value,
  label,
  decimals = 0,
  suffix = '',
  className,
}: HoloCountUpProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const finalFormatted = formatValue(value, decimals, suffix)

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayValue(value)
      return undefined
    }

    let frame = 0
    const startedAt = performance.now()
    const duration = 700

    const step = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(value * eased)

      if (progress < 1) {
        frame = requestAnimationFrame(step)
        return
      }

      setDisplayValue(value)
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <>
      <span
        aria-hidden="true"
        className={className ? `holo-count ${className}` : 'holo-count'}
      >
        {formatValue(displayValue, decimals, suffix)}
      </span>
      <span className="sr-only">
        {label}：{finalFormatted}
      </span>
    </>
  )
}
