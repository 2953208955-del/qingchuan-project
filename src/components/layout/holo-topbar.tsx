'use client'

import { useEffect, useState } from 'react'

const INITIAL_TIME = '--:--:--'

function formatLocalTime(date: Date) {
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function HoloTopBar() {
  const [time, setTime] = useState(INITIAL_TIME)

  useEffect(() => {
    const tick = () => setTime(formatLocalTime(new Date()))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <header className="holo-topbar print:hidden">
      <div className="holo-topbar__brand">
        <span className="holo-topbar__brand-name">清川</span>
        <span className="holo-topbar__brand-latin" aria-hidden="true">
          QINGCHUAN
        </span>
      </div>

      <div className="holo-topbar__identity">
        <p className="holo-topbar__title">河湖垃圾智能巡检系统 V1.0</p>
        <span className="holo-topbar__caption" aria-hidden="true">
          RIVER · LAKE · INSPECTION
        </span>
      </div>

      <div className="holo-topbar__status">
        <span className="holo-topbar__status-dot" aria-hidden="true" />
        <span className="holo-topbar__status-label">本地运行</span>
        <span className="holo-topbar__status-divider" aria-hidden="true" />
        <time
          className="holo-topbar__clock"
          aria-label="本地时间"
          dateTime={time === INITIAL_TIME ? undefined : time}
        >
          {time}
        </time>
      </div>
    </header>
  )
}
