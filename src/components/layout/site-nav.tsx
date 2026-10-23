import Link from 'next/link'

const links = [
  { href: '/inspect', label: '巡检工作台' },
  { href: '/reports', label: '报告库' },
  { href: '/knowledge', label: '知识库' },
  { href: '/eval', label: '评测' },
]

export function SiteNav() {
  return (
    <header className="border-b border-border bg-background/80 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          清川
        </Link>
        <nav aria-label="主导航" className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  )
}
