'use client'

import { useEffect, useState } from 'react'
import { HoloBadge } from '@/components/holo/holo-badge'
import { HoloPanel } from '@/components/holo/holo-panel'
import type { DashboardRun } from '@/lib/dashboard/types'
import { isPendingLowConfidence } from '@/lib/domain/review'

const AUTO_ADVANCE_MS = 6000

export function ImageReplay({ run }: { run: DashboardRun | null }) {
  const images = run?.images ?? []
  const total = images.length
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)

  const activeIndex = total === 0 ? 0 : Math.min(index, total - 1)
  const paused = hovered || focused

  useEffect(() => {
    if (total <= 1 || paused) return undefined
    if (typeof window === 'undefined') return undefined
    // Reduced motion means no timed motion at all, so the replay waits for the
    // viewer to step through frames with the controls.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined

    // A timeout keyed to the active frame restarts the full six seconds after a
    // manual step instead of inheriting the previous frame's elapsed time.
    const timer = window.setTimeout(() => {
      setIndex(current => (current + 1) % total)
    }, AUTO_ADVANCE_MS)
    return () => window.clearTimeout(timer)
  }, [activeIndex, paused, total])

  if (!run || total === 0) {
    return (
      <HoloPanel className="replay">
        <div className="replay-empty">
          <HoloBadge tone="muted">巡检影像回放 · 非实时</HoloBadge>
          <p>暂无巡检影像</p>
          <span>任务分析完成后将在此回放影像与识别框。</span>
        </div>
      </HoloPanel>
    )
  }

  const image = images[activeIndex]
  const src = `/api/images/${image.id}`
  const boxes = run.detections.filter(
    detection => detection.imageId === image.id && detection.bbox !== null,
  )

  function step(delta: number) {
    if (total <= 1) return
    setIndex((activeIndex + delta + total) % total)
  }

  return (
    <HoloPanel className="replay">
      <div
        className="replay"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={event => {
          const next = event.relatedTarget as Node | null
          if (!next || !event.currentTarget.contains(next)) setFocused(false)
        }}
      >
        <div className="replay__head">
          <HoloBadge tone="muted">巡检影像回放 · 非实时</HoloBadge>
          <span className="replay__count" aria-live="polite">
            帧 {activeIndex + 1}/{total}
          </span>
          {/* Only the task's real creation time; no invented capture timestamp. */}
          <span className="replay__created">
            任务创建 {new Date(run.createdAt).toLocaleString('zh-CN')}
          </span>
        </div>

        <div className="replay-stage">
          {/* Blurred backdrop of the same frame fills the stage without affecting
              the sharp image's box. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img aria-hidden="true" alt="" className="replay-blur" src={src} />

          <div className="replay-media">
            {/* The detection boxes are positioned in percentages of this exact
                rendered image box, so the sharp image must stay a native <img>
                whose size shrink-wraps the media element. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="replay-image"
              src={src}
              alt={`巡检影像 ${activeIndex + 1} · ${image.filename}`}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
              }}
            />
            {boxes.map(detection => {
              const review = isPendingLowConfidence(detection)
              return (
                <span
                  key={detection.id}
                  aria-hidden="true"
                  data-replay-box={detection.id}
                  className={`replay-box${review ? ' replay-box--review' : ''}`}
                  style={{
                    left: `${detection.bbox!.x * 100}%`,
                    top: `${detection.bbox!.y * 100}%`,
                    width: `${detection.bbox!.w * 100}%`,
                    height: `${detection.bbox!.h * 100}%`,
                  }}
                />
              )
            })}
          </div>

          <span aria-hidden="true" className="replay__scan" />
        </div>

        <div className="replay-controls">
          <button
            type="button"
            className="holo-btn holo-btn--ghost"
            onClick={() => step(-1)}
            disabled={total <= 1}
          >
            上一帧
          </button>

          <div className="replay-dots" role="group" aria-label="选择帧">
            {images.map((item, frame) => (
              <button
                key={item.id}
                type="button"
                className="replay-dot"
                aria-label={`查看第 ${frame + 1} 帧`}
                aria-pressed={frame === activeIndex}
                onClick={() => setIndex(frame)}
              >
                {frame + 1}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="holo-btn"
            onClick={() => step(1)}
            disabled={total <= 1}
          >
            下一帧
          </button>
        </div>
      </div>
    </HoloPanel>
  )
}
