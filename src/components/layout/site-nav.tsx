'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BookOpen,
  FileText,
  LayoutDashboard,
  ScanLine,
} from 'lucide-react'

const NAV_GROUPS = [
  {
    label: '总览',
    items: [{ href: '/', label: '总览大屏', icon: LayoutDashboard }],
  },
  {
    label: '巡检作业',
    items: [
      { href: '/inspect', label: '巡检工作台', icon: ScanLine },
      { href: '/reports', label: '报告库', icon: FileText },
    ],
  },
  {
    label: '知识中枢',
    items: [
      { href: '/knowledge', label: '知识库', icon: BookOpen },
      { href: '/eval', label: '评测中心', icon: Activity },
    ],
  },
] as const

function isActiveRoute(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function SiteNav() {
  const pathname = usePathname() ?? '/'

  return (
    <aside className="holo-nav print:hidden">
      <Link href="/" className="holo-nav__brand" aria-label="清川">
        <span className="holo-nav__brand-mark" aria-hidden="true">
          川
        </span>
        <span className="holo-nav__brand-text">
          <span className="holo-nav__brand-name">清川</span>
          <span className="holo-nav__brand-latin" aria-hidden="true">
            QINGCHUAN
          </span>
        </span>
      </Link>

      <nav className="holo-nav__nav" aria-label="主导航">
        <div className="holo-nav__groups">
          {NAV_GROUPS.map((group, groupIndex) => {
            const groupLabelId = `holo-nav-group-${groupIndex}`
            return (
              <section className="holo-nav__group" key={group.label}>
                <p className="holo-nav__group-label" id={groupLabelId}>
                  {group.label}
                </p>
                <ul className="holo-nav__list" aria-labelledby={groupLabelId}>
                  {group.items.map((item) => {
                    const active = isActiveRoute(pathname, item.href)
                    const Icon = item.icon

                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={`holo-nav__link${active ? ' is-active' : ''}`}
                        >
                          <Icon
                            className="holo-nav__icon"
                            size={16}
                            strokeWidth={1.7}
                            aria-hidden="true"
                          />
                          <span>{item.label}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      </nav>

      <div className="holo-nav__footer">
        <Link href="/privacy" className="holo-nav__privacy">隐私与数据</Link>
      </div>
    </aside>
  )
}
