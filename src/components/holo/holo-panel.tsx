type HoloPanelProps = {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}

export function HoloPanel({
  title,
  subtitle,
  actions,
  className,
  children,
}: HoloPanelProps) {
  return (
    <section className={`holo-panel ${className ?? ''}`}>
      {(title || subtitle || actions) && (
        <header className="holo-panel__head">
          <div>
            {title && <h2 className="holo-panel__title">{title}</h2>}
            {subtitle && <p className="holo-panel__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="holo-panel__actions">{actions}</div>}
        </header>
      )}
      <div className="holo-panel__body">{children}</div>
    </section>
  )
}
