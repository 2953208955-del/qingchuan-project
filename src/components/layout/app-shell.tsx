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
      </div>
    </div>
  )
}
