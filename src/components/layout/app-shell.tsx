import { HoloBackdrop } from '@/components/holo/holo-backdrop'
import { HoloTopBar } from '@/components/layout/holo-topbar'
import { SiteNav } from '@/components/layout/site-nav'

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="holo-app">
      <HoloBackdrop />
      <SiteNav />
      <div className="holo-app__content">
        <HoloTopBar />
        <main className="holo-page">{children}</main>
        <footer className="px-6 pb-5 text-center text-xs tracking-wide text-[var(--holo-muted)] print:hidden">
          © 2026 熊斯琦 版权所有 · 清川河湖垃圾智能巡检系统 V1.0
        </footer>
      </div>
    </div>
  )
}
