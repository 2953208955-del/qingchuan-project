import { DashboardHero } from '@/components/dashboard/dashboard-hero'
import { loadDashboardOverview } from '@/lib/dashboard/overview'

export const dynamic = 'force-dynamic'

export default function Home() {
  const overview = loadDashboardOverview()

  return <DashboardHero overview={overview} />
}
