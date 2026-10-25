type HoloBadgeTone = 'cyan' | 'gold' | 'magenta' | 'muted'

type HoloBadgeProps = {
  tone?: HoloBadgeTone
  className?: string
  children: React.ReactNode
}

export function HoloBadge({
  tone = 'cyan',
  className,
  children,
}: HoloBadgeProps) {
  return (
    <span
      className={`holo-badge holo-badge--${tone}${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  )
}
