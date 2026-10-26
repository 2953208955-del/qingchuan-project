import { HoloBadge } from '@/components/holo/holo-badge'
import type { DashboardOverview, DashboardRun } from '@/lib/dashboard/types'
import { ImageReplay } from './image-replay'
import { RiverMap } from './river-map'
import { StatsBoard } from './stats-board'

type BadgeTone = 'cyan' | 'gold' | 'magenta' | 'muted'

const RUN_STATUS: Record<DashboardRun['status'], { label: string; tone: BadgeTone }> = {
  idle: { label: '空闲', tone: 'muted' },
  planning: { label: '生成计划中', tone: 'cyan' },
  planned: { label: '已规划', tone: 'muted' },
  analyzing: { label: '分析中', tone: 'cyan' },
  aggregating: { label: '汇总中', tone: 'cyan' },
  retrieving: { label: '检索依据中', tone: 'cyan' },
  drafting: { label: '生成报告中', tone: 'cyan' },
  verifying: { label: '校验报告中', tone: 'cyan' },
  awaiting_review: { label: '待人工复核', tone: 'gold' },
  completed: { label: '分析完成', tone: 'cyan' },
  failed: { label: '分析失败', tone: 'magenta' },
  stale: { label: '需重新生成报告', tone: 'gold' },
}

export function DashboardHero({ overview }: { overview: DashboardOverview }) {
  const { heroRun } = overview
  const status = heroRun ? RUN_STATUS[heroRun.status] : null

  return (
    <div className="dashboard">
      <header className="dashboard-hero">
        <div className="dashboard-hero__intro">
          <p className="holo-eyebrow">QINGCHUAN · RIVER INSPECTION</p>
          <div className="dashboard-hero__title-row">
            <h1>全域巡检态势</h1>
            {heroRun?.isDemo && (
              <HoloBadge tone="gold">演示任务 · 人工构造数据</HoloBadge>
            )}
            {!heroRun && <HoloBadge tone="muted">暂无巡检数据</HoloBadge>}
          </div>
        </div>

        {heroRun && status && (
          <div className="dashboard-hero__task">
            <span className="dashboard-hero__task-label">
              当前主任务 · {heroRun.location || '未标注河段'}
            </span>
            <HoloBadge tone={status.tone}>{status.label}</HoloBadge>
          </div>
        )}
      </header>

      <div className="dashboard-grid">
        <div className="dashboard-grid__map">
          <RiverMap
            run={heroRun}
            points={overview.mapPoints}
            hiddenCount={overview.hiddenMapPointCount}
            summary={{
              totalRuns: overview.stats.totalRuns,
              reportCount: overview.stats.reportCount,
              clauseCount: overview.stats.clauseCount,
            }}
          />
        </div>

        <div className="dashboard-grid__replay">
          <ImageReplay run={heroRun} />
        </div>

        <div className="dashboard-grid__stats">
          <StatsBoard stats={overview.stats} />
        </div>
      </div>
    </div>
  )
}
