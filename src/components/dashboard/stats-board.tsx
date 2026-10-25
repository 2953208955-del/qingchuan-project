import { HoloBadge } from '@/components/holo/holo-badge'
import { HoloCountUp } from '@/components/holo/holo-count-up'
import { HoloPanel } from '@/components/holo/holo-panel'
import { groupCategoryMix } from '@/lib/dashboard/chart-data'
import type { CategorySlice, DashboardStats } from '@/lib/dashboard/types'

const SERIES_COLORS = ['#74E6F2', '#5AA7FF', '#D8BE82', '#8CD8C2', '#B9C8D8']
const REST_COLOR = '#6E8A91'
const NATURAL_COLOR = '#8FA6A8'

const DONUT_RADIUS = 44
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS
const DONUT_GAP = 2

const LINE_WIDTH = 260
const LINE_HEIGHT = 92
const LINE_TOP = 10
const LINE_BOTTOM = 78
const LINE_LEFT = 10
const LINE_RIGHT = 250

function sliceColor(key: string, index: number): string {
  if (key === 'rest') return REST_COLOR
  if (key === 'natural') return NATURAL_COLOR
  return SERIES_COLORS[index % SERIES_COLORS.length]
}

type DonutSegment = CategorySlice & {
  color: string
  dash: number
  offset: number
}

function buildDonutSegments(slices: CategorySlice[]): DonutSegment[] {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0)
  if (total <= 0) return []

  let cursor = 0

  return slices
    .map((slice, index): DonutSegment | null => {
      if (slice.count <= 0) return null

      const arc = (slice.count / total) * DONUT_CIRCUMFERENCE
      const segment: DonutSegment = {
        ...slice,
        color: sliceColor(slice.key, index),
        dash: arc > DONUT_GAP ? arc - DONUT_GAP : arc,
        offset: -cursor,
      }
      cursor += arc
      return segment
    })
    .filter((segment): segment is DonutSegment => segment !== null)
}

type LinePoint = { x: number; y: number; count: number }

function buildLinePoints(counts: number[]): LinePoint[] {
  if (counts.length === 0) return []

  const max = Math.max(...counts)
  const scale = max > 0 ? max : 1
  const step =
    counts.length > 1 ? (LINE_RIGHT - LINE_LEFT) / (counts.length - 1) : 0

  return counts.map((count, index) => ({
    x: LINE_LEFT + index * step,
    y: LINE_BOTTOM - (count / scale) * (LINE_BOTTOM - LINE_TOP),
    count,
  }))
}

function toLinePath(points: LinePoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

export function StatsBoard({ stats }: { stats: DashboardStats }) {
  const categorySlices = groupCategoryMix(stats.categoryMix, 5)
  const donutSegments = buildDonutSegments(categorySlices)

  const confidenceTotal = stats.confidenceBins.reduce(
    (sum, bin) => sum + bin.count,
    0,
  )
  const linePoints = buildLinePoints(stats.confidenceBins.map(bin => bin.count))
  const linePath = toLinePath(linePoints)
  const firstPoint = linePoints[0]
  const lastPoint = linePoints[linePoints.length - 1]
  const areaPath =
    firstPoint && lastPoint
      ? `${linePath} L ${lastPoint.x} ${LINE_BOTTOM} L ${firstPoint.x} ${LINE_BOTTOM} Z`
      : ''

  const kpis = [
    { key: 'detections', label: '累计识别', value: stats.totalDetections, suffix: '' },
    { key: 'pending', label: '待复核', value: stats.pendingLowConfidence, suffix: '' },
    {
      key: 'confidence',
      label: '平均置信度',
      value: Math.round(stats.averageConfidence * 100),
      suffix: '%',
    },
    { key: 'runs', label: '巡检任务', value: stats.totalRuns, suffix: '' },
  ] as const

  return (
    <HoloPanel
      title="数据看板"
      subtitle="全库累计"
      className="stats-board"
      actions={<HoloBadge tone="cyan">报告 {stats.reportCount} 份</HoloBadge>}
    >
      <div className="stats-kpis">
        {kpis.map(kpi => (
          <div key={kpi.key} className="stats-kpi" data-kpi={kpi.key}>
            <span className="stats-kpi__label">{kpi.label}</span>
            <HoloCountUp
              value={kpi.value}
              label={kpi.label}
              suffix={kpi.suffix}
              className="stats-kpi__value"
            />
            <span className="stats-kpi__mark" aria-hidden="true" />
          </div>
        ))}
      </div>

      <div className="stats-charts">
        <section className="stats-card stats-donut" aria-labelledby="stats-donut-title">
          <h3 id="stats-donut-title" className="stats-card__title">
            类别构成
          </h3>

          <div className="stats-donut__chart">
            <svg
              className="stats-donut__svg"
              viewBox="0 0 120 120"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="60"
                cy="60"
                r={DONUT_RADIUS}
                fill="none"
                stroke="rgba(116, 230, 242, 0.1)"
                strokeWidth="7"
              />
              <circle
                cx="60"
                cy="60"
                r={DONUT_RADIUS}
                fill="none"
                stroke="rgba(116, 230, 242, 0.06)"
                strokeWidth="11"
              />
              {donutSegments.map(segment => (
                <circle
                  key={segment.key}
                  cx="60"
                  cy="60"
                  r={DONUT_RADIUS}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="7"
                  strokeDasharray={`${segment.dash} ${DONUT_CIRCUMFERENCE - segment.dash}`}
                  strokeDashoffset={segment.offset}
                  transform="rotate(-90 60 60)"
                  opacity="0.92"
                />
              ))}
              <text x="60" y="57" textAnchor="middle" className="stats-donut__total">
                {stats.totalDetections}
              </text>
              <text x="60" y="72" textAnchor="middle" className="stats-donut__unit">
                目标
              </text>
            </svg>
          </div>

          {categorySlices.length > 0 ? (
            <ul className="stats-legend" data-slice-legend>
              {categorySlices.map((slice, index) => (
                <li key={slice.key} className="stats-legend__item">
                  <span
                    className="stats-legend__dot"
                    style={{ backgroundColor: sliceColor(slice.key, index) }}
                    aria-hidden="true"
                  />
                  <span className="stats-legend__label">{slice.label}</span>
                  <span className="stats-legend__count">{slice.count}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="stats-empty">暂无识别类别</p>
          )}

          {stats.categoryMix.length > 0 && (
            <details className="stats-details">
              <summary>全部类别</summary>
              <ul className="stats-details__list">
                {stats.categoryMix.map(item => (
                  <li key={item.category} className="stats-details__row">
                    {item.label} {item.count}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section
          className="stats-card stats-confidence"
          aria-labelledby="stats-confidence-title"
        >
          <h3 id="stats-confidence-title" className="stats-card__title">
            置信度分布
          </h3>

          <div className="stats-confidence__chart">
            <svg
              className="stats-confidence__svg"
              viewBox={`0 0 ${LINE_WIDTH} ${LINE_HEIGHT}`}
              aria-hidden="true"
              focusable="false"
            >
              <defs>
                <linearGradient
                  id="stats-confidence-gradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#74E6F2" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#74E6F2" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[LINE_TOP, (LINE_TOP + LINE_BOTTOM) / 2, LINE_BOTTOM].map(y => (
                <line
                  key={`h-${y}`}
                  x1={LINE_LEFT}
                  y1={y}
                  x2={LINE_RIGHT}
                  y2={y}
                  stroke="rgba(116, 230, 242, 0.12)"
                  strokeWidth="1"
                  strokeDasharray="2 5"
                />
              ))}

              {linePoints.map(point => (
                <line
                  key={`v-${point.x}`}
                  x1={point.x}
                  y1={LINE_TOP}
                  x2={point.x}
                  y2={LINE_BOTTOM}
                  stroke="rgba(116, 230, 242, 0.07)"
                  strokeWidth="1"
                />
              ))}

              {areaPath && (
                <path d={areaPath} fill="url(#stats-confidence-gradient)" />
              )}

              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#74E6F2"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {linePoints.map(point =>
                point.count > 0 ? (
                  <circle
                    key={`dot-${point.x}`}
                    cx={point.x}
                    cy={point.y}
                    r="1.7"
                    fill="#0B2329"
                    stroke="#74E6F2"
                    strokeWidth="1.2"
                  />
                ) : null,
              )}

              {lastPoint && (
                <>
                  <circle
                    cx={lastPoint.x}
                    cy={lastPoint.y}
                    r="5"
                    fill="none"
                    stroke="rgba(216, 190, 130, 0.35)"
                    strokeWidth="1.2"
                  />
                  <circle cx={lastPoint.x} cy={lastPoint.y} r="2.6" fill="#D8BE82" />
                </>
              )}
            </svg>
          </div>

          <p className="stats-confidence__caption">
            共 {confidenceTotal} 个检测 · 最高档位越靠右置信度越高
          </p>

          <ul className="stats-confidence__bins">
            {stats.confidenceBins.map(bin => (
              <li key={bin.label} className="stats-confidence__bin">
                <span className="stats-confidence__bin-label">{bin.label}</span>
                <span className="stats-confidence__bin-count">{bin.count} 个</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </HoloPanel>
  )
}
