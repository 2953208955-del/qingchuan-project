'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { HoloBadge } from '@/components/holo/holo-badge'
import { HoloPanel } from '@/components/holo/holo-panel'
import type { DashboardRun, MapPoint } from '@/lib/dashboard/types'

export const RIVER_BAND_PATH =
  'M -60 660 C 160 590 300 540 430 480 C 610 400 690 360 800 285 C 930 195 1020 180 1260 45 L 1260 205 C 1020 330 940 335 835 415 C 720 505 600 535 440 610 C 300 675 150 720 -60 780 Z'

export const RIVER_EDGE_PATH =
  'M -60 660 C 160 590 300 540 430 480 C 610 400 690 360 800 285 C 930 195 1020 180 1260 45'

const RIVER_LOWER_EDGE_PATH =
  'M 1260 205 C 1020 330 940 335 835 415 C 720 505 600 535 440 610 C 300 675 150 720 -60 780'

export const PATROL_PATH =
  'M 20 640 C 210 565 315 505 430 470 C 600 420 705 392 815 310 C 925 228 1035 210 1180 110'

const CONTOUR_PATHS = [
  'M -40 180 C 180 130 320 205 520 168 C 760 124 900 196 1240 140',
  'M -40 300 C 150 245 340 315 540 268 C 760 220 950 296 1240 236',
  'M -40 470 C 190 420 330 500 560 452 C 790 404 1000 470 1240 422',
  'M -40 585 C 200 545 360 620 600 575 C 840 530 1040 596 1240 552',
]

const REVIEW_STATUS_LABELS: Record<MapPoint['reviewStatus'], string> = {
  pending: '待复核',
  confirmed: '已确认',
  rejected: '已驳回',
  corrected: '已修正',
}

const SEVERITY_LABELS: Record<MapPoint['severity'], string> = {
  normal: '普通点位',
  review: '待复核',
  natural: '自然漂浮物',
}

const LEGEND: { key: MapPoint['severity']; label: string }[] = [
  { key: 'normal', label: '普通' },
  { key: 'review', label: '待复核' },
  { key: 'natural', label: '自然漂浮物' },
]

const MOBILE_MAP_MAX_WIDTH = 640
const MOBILE_MARKER_SIZE = 28
const MOBILE_MARKER_GAP = 2

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * Real detections can sit on adjacent illustrative anchors. Below 640px their
 * 28px touch targets would otherwise overlap, so fan the visible positions out
 * from the anchor until every centre is at least one full marker apart. The
 * source points and detection data are never mutated.
 */
export function spreadNarrowMapPoints(
  points: MapPoint[],
  width: number,
  height: number,
): MapPoint[] {
  if (width <= 0 || height <= 0 || width > MOBILE_MAP_MAX_WIDTH) return points

  const minimumDistance = MOBILE_MARKER_SIZE + MOBILE_MARKER_GAP
  const margin = MOBILE_MARKER_SIZE / 2 + MOBILE_MARKER_GAP
  const placed: { x: number; y: number }[] = []

  return points.map(point => {
    const originX = (point.x / 100) * width
    const originY = (point.y / 100) * height
    let chosenX = originX
    let chosenY = originY

    // Candidate 0 is the true anchor. The remaining rings fan out
    // deterministically around it, so equal inputs always yield equal layout.
    for (let index = 0; index < 120; index += 1) {
      const ring = Math.ceil(index / 12)
      const radius = ring * minimumDistance
      const angle = ((index % 12) * Math.PI) / 6 + ring * 0.37
      const candidateX = Math.min(
        width - margin,
        Math.max(margin, originX + Math.cos(angle) * radius),
      )
      const candidateY = Math.min(
        height - margin,
        Math.max(margin, originY + Math.sin(angle) * radius),
      )
      const clear = placed.every(
        other =>
          Math.hypot(candidateX - other.x, candidateY - other.y) >= minimumDistance,
      )
      if (!clear) continue
      chosenX = candidateX
      chosenY = candidateY
      break
    }

    placed.push({ x: chosenX, y: chosenY })
    return {
      ...point,
      x: (chosenX / width) * 100,
      y: (chosenY / height) * 100,
    }
  })
}

type RiverMapProps = {
  run: DashboardRun | null
  points: MapPoint[]
  hiddenCount: number
  summary: { totalRuns: number; reportCount: number; clauseCount: number }
}

export function RiverMap({ run, points, hiddenCount, summary }: RiverMapProps) {
  const [selected, setSelected] = useState<MapPoint | null>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    const measure = () => {
      const rect = canvas.getBoundingClientRect()
      setCanvasSize(current =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height },
      )
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [])

  const displayPoints = spreadNarrowMapPoints(points, canvasSize.width, canvasSize.height)

  const close = useCallback(() => {
    setSelected(null)
    triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!selected) return undefined

    // Focus the first focusable element in the popover (its close button).
    closeButtonRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setSelected(null)
      triggerRef.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [selected])

  function togglePoint(event: React.MouseEvent<HTMLButtonElement>, point: MapPoint) {
    event.stopPropagation()
    triggerRef.current = event.currentTarget
    if (selected?.id === point.id) {
      setSelected(null)
      return
    }
    setSelected(point)
  }

  const selectedPercent = selected ? percent(selected.confidence) : ''

  return (
    <HoloPanel
      className="river-map"
      title="河道态势"
      subtitle="示意航线 · 点位来自真实识别"
      actions={
        <HoloBadge tone="gold">
          {run ? run.location ?? '未填写地点' : '暂无任务'}
        </HoloBadge>
      }
    >
      <div
        ref={canvasRef}
        className="river-map__canvas"
        onClick={() => {
          if (selected) close()
        }}
      >
        <svg
          className="river-map__svg"
          viewBox="0 0 1200 760"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id="river-map-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--holo-bg-2)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--holo-bg)" stopOpacity="0.25" />
            </linearGradient>
            <linearGradient id="river-map-water" x1="0" y1="0" x2="0.9" y2="1">
              <stop offset="0%" stopColor="var(--holo-blue)" stopOpacity="0.26" />
              <stop offset="52%" stopColor="var(--holo-cyan)" stopOpacity="0.12" />
              <stop offset="100%" stopColor="var(--holo-blue)" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="river-map-bank" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--holo-cyan)" stopOpacity="0.1" />
              <stop offset="42%" stopColor="var(--holo-cyan)" stopOpacity="0.78" />
              <stop offset="100%" stopColor="var(--holo-gold)" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="river-map-scan" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--holo-cyan)" stopOpacity="0" />
              <stop offset="48%" stopColor="var(--holo-cyan)" stopOpacity="0.16" />
              <stop offset="52%" stopColor="var(--holo-cyan)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--holo-cyan)" stopOpacity="0" />
            </linearGradient>
            <filter id="river-map-soft" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <filter id="river-map-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern
              id="river-map-grid"
              width="60"
              height="60"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 60 0 L 0 0 0 60"
                fill="none"
                stroke="var(--holo-cyan)"
                strokeOpacity="0.06"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect width="1200" height="760" fill="url(#river-map-sky)" />
          <rect width="1200" height="760" fill="url(#river-map-grid)" opacity="0.55" />

          {/* Distant, blurred channel behind the main water band. */}
          <path
            d={RIVER_BAND_PATH}
            transform="translate(-80 -52) scale(1.04)"
            fill="none"
            stroke="var(--holo-blue)"
            strokeOpacity="0.2"
            strokeWidth="56"
            filter="url(#river-map-soft)"
          />

          {CONTOUR_PATHS.map(path => (
            <path
              key={path}
              d={path}
              fill="none"
              stroke="var(--holo-cyan)"
              strokeOpacity="0.08"
              strokeWidth="1"
              strokeDasharray="6 14"
            />
          ))}

          <path d={RIVER_BAND_PATH} fill="url(#river-map-water)" />

          {/* Upper and lower bank glows give the flat band its 2.5D edge. */}
          <path
            d={RIVER_EDGE_PATH}
            fill="none"
            stroke="url(#river-map-bank)"
            strokeWidth="2.4"
            filter="url(#river-map-glow)"
          />
          <path
            d={RIVER_LOWER_EDGE_PATH}
            fill="none"
            stroke="var(--holo-cyan)"
            strokeOpacity="0.22"
            strokeWidth="1.3"
          />

          <path
            className="river-map__route"
            d={PATROL_PATH}
            fill="none"
            stroke="var(--holo-gold)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeDasharray="7 11"
            filter="url(#river-map-glow)"
          />

          <rect
            className="river-map__scan"
            x="0"
            y="0"
            width="1200"
            height="150"
            fill="url(#river-map-scan)"
          />
        </svg>

        <span className="river-map__tag">河段态势 · 示意</span>

        {run !== null &&
          displayPoints.map(point => (
            <button
              key={point.id}
              type="button"
              data-map-point={point.id}
              className={`river-map__point river-map__point--${point.severity}`}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              aria-label={`${point.label}，置信度 ${percent(point.confidence)}，${REVIEW_STATUS_LABELS[point.reviewStatus]}`}
              aria-pressed={selected?.id === point.id}
              onClick={event => togglePoint(event, point)}
            >
              <span className="river-map__pulse" aria-hidden="true" />
              <span className="river-map__dot" aria-hidden="true" />
            </button>
          ))}

        {run === null && (
          <div className="river-map__empty">
            <p>暂无可展示的巡检任务</p>
            <span>完成一次巡检后，真实识别点位将在此显示</span>
          </div>
        )}

        {selected && (
          <div
            className="river-map__popover"
            role="dialog"
            aria-label={`${selected.label}识别详情`}
            onClick={event => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="river-map__popover-close"
              aria-label="关闭识别详情"
              onClick={close}
            >
              ×
            </button>

            <div className="river-map__popover-head">
              <span className="river-map__popover-label">{selected.label}</span>
              <HoloBadge
                tone={
                  selected.severity === 'review'
                    ? 'magenta'
                    : selected.severity === 'natural'
                      ? 'muted'
                      : 'cyan'
                }
              >
                {SEVERITY_LABELS[selected.severity]}
              </HoloBadge>
            </div>

            <div className="river-map__popover-body">
              <Image
                className="river-map__thumb"
                src={`/api/images/${selected.imageId}`}
                alt={`${selected.label}原图缩略图`}
                width={96}
                height={72}
                unoptimized
              />
              <dl className="river-map__facts">
                <div>
                  <dt>类别</dt>
                  <dd>{selected.label}</dd>
                </div>
                <div>
                  <dt>置信度</dt>
                  <dd>{selectedPercent}</dd>
                </div>
                <div>
                  <dt>复核状态</dt>
                  <dd>{REVIEW_STATUS_LABELS[selected.reviewStatus]}</dd>
                </div>
                <div>
                  <dt>任务 ID</dt>
                  <dd>{run?.id ?? '—'}</dd>
                </div>
              </dl>
            </div>

            <div className="river-map__popover-actions">
              {run?.hasReport ? (
                <Link className="river-map__report-link" href={`/reports/${run.id}`}>
                  查看完整报告
                </Link>
              ) : (
                <span className="river-map__no-report">报告尚未生成</span>
              )}
            </div>
          </div>
        )}
      </div>

      <footer className="river-map__footer">
        <div className="river-map__meta">
          <ul className="river-map__legend" aria-label="点位图例">
            {LEGEND.map(item => (
              <li
                key={item.key}
                className={`river-map__legend-item river-map__legend-item--${item.key}`}
              >
                {item.label}
              </li>
            ))}
          </ul>
          <p className="river-map__disclaimer">河道与点位为示意排布，点位内容来自真实识别结果</p>
        </div>
        <div className="river-map__totals">
          <p className="river-map__summary">
            {`累计任务 ${summary.totalRuns} · 报告 ${summary.reportCount} · 标准条款 ${summary.clauseCount}`}
          </p>
          {hiddenCount > 0 && (
            <p className="river-map__capped">
              {`展示 ${points.length}/${points.length + hiddenCount}`}
            </p>
          )}
        </div>
      </footer>
    </HoloPanel>
  )
}
