# 清川全息大屏改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把清川全产品的浅色工具界面改造成深空青全息视觉系统，并把首页升级为使用真实 SQLite 数据的河湖巡检指挥大屏。

**Architecture:** 先建立全局全息 token、背景与外壳；再用纯函数从 SQLite 生成可序列化的大屏视图模型和地图点位；随后实现地图、影像回放与纯 SVG 看板三个展示岛；最后逐页换肤并做响应式、无障碍、打印和全量验证。所有业务 API、数据库 schema、Agent 流程保持不变。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript strict、Tailwind CSS v4、Drizzle + better-sqlite3、lucide-react、内联 SVG（不使用 Recharts）、Vitest + Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-25-holo-dashboard-design.md`

## Global Constraints

- 不新增任何运行时或开发依赖；不引入 Three.js/WebGL、地图 SDK、字体包或新图表库。
- 不修改后端 API、数据库 schema、Agent 流程、评测结果或预算/复核门禁。
- 大屏所有数字、点位、影像和报告链接必须来自本地 SQLite；不得虚构任务、坐标、置信度、告警时间或“实时”状态。
- 地图与航线必须标注“示意”；影像必须标注“巡检影像回放 · 非实时”；演示任务按报告 `source === 'manual'` 标注。
- 洋红 `#FF86B7` 只用于待复核/告警，不进入普通图表系列。
- 1920×1080 是主验收分辨率；1440/1280/390 宽度必须可用，不得横向溢出。
- 保留既有 `aria-label`、按钮名称、`data-*` 测试钩子与关键中文文案；巡检、复核、重新生成、导出流程不得回退。
- 报告打印必须白底黑字、无全息光效；现有导出拦截逻辑不变。
- 所有动效支持 `prefers-reduced-motion: reduce`；焦点环在所有面板上可见。
- 当前分支 `feat/qingchuan-implementation`；不合并、不推送、不打 tag。

## Review Focus

1. **空库 / 无报告任务**：首页不得崩溃、不得出现 404 报告链接；Task 4 的空库测试、Task 5 的无报告测试、Task 8 的 E2E 覆盖。
2. **超过 24 个点位或 5 个类别**：必须显式展示上限或“其余类别”，不能静默截断；Task 3 的两个上限测试覆盖。
3. **低分辨率或非宽屏图片**：轮播不得放大低清图，识别框不得因裁剪错位；Task 6 用 1×1 与多图场景覆盖渲染与框数量，视觉比例由 Task 6 的 CSS 约束负责。
4. **键盘 / 屏幕阅读器 / 减少动效**：地图弹窗必须可 Esc 关闭并归还焦点，导航需 `aria-current`，自动轮播在 reduced-motion 下停止；Task 2、5、6 覆盖。
5. **打印**：深色主题不得带到纸面；Task 10 的打印 CSS 与现有 `tests/e2e/report.spec.ts` 打印断言覆盖，Task 12 做人工打印检查。

---

### Task 1: 全息设计基座与基础组件

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/holo/holo-backdrop.tsx`
- Create: `src/components/holo/holo-panel.tsx`
- Create: `src/components/holo/holo-badge.tsx`
- Test: `tests/unit/holo-primitives.test.tsx`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `HoloBackdrop(): React.ReactElement`
  - `HoloPanel({ title?, subtitle?, actions?, className?, children }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode })`
  - `HoloBadge({ tone?: 'cyan' | 'gold' | 'magenta' | 'muted'; className?: string; children: React.ReactNode })`
  - CSS 类：`.holo-app`、`.holo-backdrop`、`.holo-panel`、`.holo-panel__head`、`.holo-badge`、`.holo-btn`、`.holo-input`、`.holo-page`。

- [ ] **Step 1: 写失败测试**

```tsx
// tests/unit/holo-primitives.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HoloBackdrop } from '@/components/holo/holo-backdrop'
import { HoloPanel } from '@/components/holo/holo-panel'
import { HoloBadge } from '@/components/holo/holo-badge'

afterEach(cleanup)

describe('holo primitives', () => {
  it('renders a panel title, subtitle, actions and children', () => {
    const { container } = render(
      <HoloPanel title="河道态势" subtitle="示意" actions={<button>操作</button>}>
        <p>内容</p>
      </HoloPanel>,
    )
    expect(screen.getByText('河道态势')).toBeInTheDocument()
    expect(screen.getByText('示意')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '操作' })).toBeInTheDocument()
    expect(screen.getByText('内容')).toBeInTheDocument()
    expect(container.querySelector('.holo-panel')).not.toBeNull()
  })

  it('exposes badge tone classes', () => {
    const { container } = render(<HoloBadge tone="magenta">待复核</HoloBadge>)
    expect(screen.getByText('待复核')).toHaveClass('holo-badge--magenta')
    expect(container.querySelector('.holo-badge')).not.toBeNull()
  })

  it('marks the decorative backdrop as hidden from assistive tech', () => {
    const { container } = render(<HoloBackdrop />)
    expect(container.querySelector('.holo-backdrop')).toHaveAttribute('aria-hidden', 'true')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/holo-primitives.test.tsx`
Expected: FAIL，因为三个组件模块尚不存在。

- [ ] **Step 3: 写全局 token、背景与基础组件**

在 `globals.css`：
- 保留现有 shadcn token 名称，把 `:root` 与 `.dark` 的值改成深空青映射；增加 `--holo-*` 变量：`--holo-bg: #041419`、`--holo-bg-2: #061c22`、`--holo-cyan: #74e6f2`、`--holo-blue: #5aa7ff`、`--holo-gold: #d8be82`、`--holo-magenta: #ff86b7`、`--holo-text: #e6f6f7`、`--holo-muted: #8fb2b8`、`--holo-line: rgba(116,230,242,.16)`。
- 在 `@theme inline` 中注册 `--color-holo-cyan`、`--color-holo-gold` 等，供 Tailwind 使用。
- 设置 `color-scheme: dark`；body 使用深色渐变与中文细体字体栈。
- 增加 `.holo-app`（`min-height:100vh; position:relative; isolation:isolate`）、`.holo-backdrop`（`position:fixed; inset:0; z-index:0; pointer-events:none; overflow:hidden`）、`.holo-app__content`（`position:relative; z-index:1`）。
- `.holo-panel` 使用半透明渐变 + `backdrop-filter: blur(20px) saturate(120%)` + 1px 半透明青边 + 18–22px 圆角 + 内外体积光；四角 L 形高光用 `::before/::after`，不要粗边框。
- `.holo-panel__head` 细线分隔；`.holo-panel__title` 细字重、弱发光。
- `.holo-badge` 胶囊样式；四个 tone 修饰类。
- 增加 `.holo-btn`、`.holo-btn--primary`、`.holo-btn--ghost`、`.holo-input`、`.holo-page`、`.holo-label`，供后续任务直接使用。
- 增加关键帧：`holo-sweep`（仅用于标题扫光）、`holo-ripple`、`holo-float`、`holo-route`、`holo-scan`、`holo-pulse`、`holo-flicker`（低透明度）。
- 增加 `@media (prefers-reduced-motion: reduce)`：停止这些动画与平滑滚动。

`HoloBackdrop` 用固定静态数组渲染 18 个粒子，每个粒子有确定的 `left/top/delay/duration/size`；不要使用 `Math.random()` 或 `Date.now()`，避免水合不一致。背景包含两团径向光、两层低透明波纹 SVG、粒子、扫描线、底部透视网格与暗角。

`HoloPanel` 结构固定为：

```tsx
<section className={`holo-panel ${className ?? ''}`}>
  {(title || subtitle || actions) && (
    <header className="holo-panel__head">
      <div>
        {title && <h2 className="holo-panel__title">{title}</h2>}
        {subtitle && <p className="holo-panel__subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="holo-panel__actions">{actions}</div>}
    </header>
  )}
  <div className="holo-panel__body">{children}</div>
</section>
```

`HoloBadge` 输出 `className={`holo-badge holo-badge--${tone}`}`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/holo-primitives.test.tsx`
Expected: PASS（3 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/app/globals.css src/components/holo tests/unit/holo-primitives.test.tsx
git commit -m "feat: add holographic design tokens and primitives"
```

---

### Task 2: 全息外壳、树状导航与顶栏

**Files:**
- Modify: `src/app/layout.tsx`
- Rewrite: `src/components/layout/app-shell.tsx`
- Rewrite: `src/components/layout/site-nav.tsx`
- Create: `src/components/layout/holo-topbar.tsx`
- Test: `tests/unit/nav.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 `HoloBackdrop`、`.holo-app*` 类。
- Produces:
  - `SiteNav(): React.ReactElement`（客户端，使用 `usePathname`）
  - `HoloTopBar(): React.ReactElement`（客户端时钟）
  - `AppShell({ children }): React.ReactElement`
  - 导航链接可访问名称：`总览大屏`、`巡检工作台`、`报告库`、`知识库`、`评测中心`、`清川`。

- [ ] **Step 1: 写失败测试**

```tsx
// tests/unit/nav.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

const mocks = vi.hoisted(() => ({ pathname: '/inspect' }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))

import { SiteNav } from '@/components/layout/site-nav'
import { AppShell } from '@/components/layout/app-shell'
import { HoloTopBar } from '@/components/layout/holo-topbar'

afterEach(() => {
  cleanup()
  mocks.pathname = '/inspect'
})

describe('SiteNav', () => {
  it('renders the holographic tree links and marks the active route', () => {
    render(<SiteNav />)
    expect(screen.getByRole('link', { name: '总览大屏' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '巡检工作台' })).toHaveAttribute('href', '/inspect')
    expect(screen.getByRole('link', { name: '报告库' })).toHaveAttribute('href', '/reports')
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.getByRole('link', { name: '评测中心' })).toHaveAttribute('href', '/eval')
    expect(screen.getByRole('link', { name: '清川' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '巡检工作台' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '报告库' })).not.toHaveAttribute('aria-current')
  })

  it('keeps nested routes active under their parent link', () => {
    mocks.pathname = '/reports/e2e-run-1'
    render(<SiteNav />)
    expect(screen.getByRole('link', { name: '报告库' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('AppShell', () => {
  it('renders children, navigation and top bar', () => {
    render(
      <AppShell>
        <p>页面内容</p>
      </AppShell>,
    )
    expect(screen.getByText('页面内容')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '巡检工作台' })).toHaveAttribute('href', '/inspect')
    expect(screen.getByText('河湖垃圾智能巡检系统')).toBeInTheDocument()
  })
})

describe('HoloTopBar', () => {
  it('renders the product title and local runtime label', () => {
    render(<HoloTopBar />)
    expect(screen.getByText('清川')).toBeInTheDocument()
    expect(screen.getByText('河湖垃圾智能巡检系统')).toBeInTheDocument()
    expect(screen.getByText('本地运行')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/nav.test.tsx`
Expected: FAIL，因为导航仍是旧结构、`HoloTopBar` 不存在。

- [ ] **Step 3: 实现外壳、导航与顶栏**

- `src/app/layout.tsx`：metadata 标题改为 `清川 · 河湖垃圾智能巡检系统`；增加 `viewport` 导出（`themeColor: '#041419'`、`colorScheme: 'dark'`）；`<body className="antialiased">` 保留，`AppShell` 继续包裹 children。
- `SiteNav` 客户端组件：使用 `usePathname`；固定分组结构：
  - 总览：`总览大屏`（`/`，`LayoutDashboard`）
  - 巡检作业：`巡检工作台`（`/inspect`，`ScanLine`）、`报告库`（`/reports`，`FileText`）
  - 知识中枢：`知识库`（`/knowledge`，`BookOpen`）、`评测中心`（`/eval`，`Activity`）
- 当前路由判定：`href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/')`；命中时 `aria-current="page"` 并添加 `.is-active`。
- 品牌链接设置 `aria-label="清川"`，视觉文字“清川”+ `aria-hidden` 的 `QINGCHUAN`；仍链接 `/`。
- 导航根元素 `className="holo-nav"`，桌面固定左侧 236px；`<1024px` 改为顶部横向滚动，分组标签隐藏。打印隐藏。
- `HoloTopBar` 客户端：左侧品牌/副标题，中间“河湖垃圾智能巡检系统”，右侧“本地运行”状态点与本地时间。时间初始渲染 `--:--:--`，`useEffect` 挂载后每秒更新，避免水合不一致。不要写“在线”“实时”。
- `AppShell`：`<div className="holo-app"><HoloBackdrop/><SiteNav/><div className="holo-app__content"><HoloTopBar/><main className="holo-page">{children}</main></div></div>`。
- 内容区桌面 `margin-left: 276px`（236 导航 + 40 间距）；`<1024px` 归零。`.holo-page` 统一 `max-width: 1600px; margin-inline: auto; padding: 20px 24px 28px`；总览页在这个宽度内铺满网格。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/nav.test.tsx tests/unit/holo-primitives.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/layout.tsx src/components/layout tests/unit/nav.test.tsx
git commit -m "feat: replace app shell with holographic navigation"
```

---

### Task 3: 大屏视图类型、地图点位与图表数据

**Files:**
- Create: `src/lib/dashboard/types.ts`
- Create: `src/lib/dashboard/map-points.ts`
- Create: `src/lib/dashboard/chart-data.ts`
- Test: `tests/unit/dashboard-map-points.test.ts`
- Test: `tests/unit/dashboard-chart-data.test.ts`

**Interfaces:**
- Consumes: `Detection`、`UploadedImage`、`RunStatus`、`DebrisCategory`、`CATEGORY_LABELS`。
- Produces:
  - `DashboardDetection = Detection & { createdAt: number }`
  - `DashboardRun`（字段见下）
  - `CategoryCount`、`ConfidenceBin`、`DashboardStats`、`DashboardOverview`
  - `MAP_ANCHORS: ReadonlyArray<{ x: number; y: number }>`（24 个百分比坐标）
  - `MAP_POINT_LIMIT = 24`
  - `buildMapPoints(detections: DashboardDetection[]): { points: MapPoint[]; hiddenCount: number }`
  - `buildCategoryMix(detections: DashboardDetection[]): CategoryCount[]`
  - `buildConfidenceBins(detections: DashboardDetection[]): ConfidenceBin[]`
  - `groupCategoryMix(mix: CategoryCount[], maxSlices = 5): CategorySlice[]`

```ts
export type CategorySlice = { key: string; label: string; count: number }
export type MapPoint = {
  id: string
  detectionId: string
  imageId: string
  category: DebrisCategory
  label: string
  confidence: number
  reviewStatus: Detection['reviewStatus']
  severity: 'normal' | 'review' | 'natural'
  x: number
  y: number
}
```

- [ ] **Step 1: 写失败测试**

```ts
// tests/unit/dashboard-map-points.test.ts
import { describe, expect, it } from 'vitest'
import { MAP_ANCHORS, MAP_POINT_LIMIT, buildMapPoints } from '@/lib/dashboard/map-points'
import type { DashboardDetection } from '@/lib/dashboard/types'

function det(id: string, overrides: Partial<DashboardDetection> = {}): DashboardDetection {
  return {
    id, imageId: 'img-1', category: 'plastic_bottle', material: null,
    confidence: 0.9, bbox: null, description: '', source: 'vlm',
    reviewStatus: 'confirmed', createdAt: 1, ...overrides,
  }
}

describe('buildMapPoints', () => {
  it('places every detection deterministically and marks review/natural severity', () => {
    const result = buildMapPoints([
      det('low', { confidence: 0.42, reviewStatus: 'pending', createdAt: 3 }),
      det('natural', { category: 'natural', createdAt: 2 }),
      det('normal', { createdAt: 1 }),
    ])
    expect(result.hiddenCount).toBe(0)
    expect(result.points.map(p => p.id)).toEqual(['normal', 'natural', 'low'])
    expect(result.points.find(p => p.id === 'low')?.severity).toBe('review')
    expect(result.points.find(p => p.id === 'natural')?.severity).toBe('natural')
    expect(result.points.find(p => p.id === 'normal')?.severity).toBe('normal')
    for (const point of result.points) {
      expect(point.x).toBeGreaterThanOrEqual(0)
      expect(point.x).toBeLessThanOrEqual(100)
      expect(point.y).toBeGreaterThanOrEqual(0)
      expect(point.y).toBeLessThanOrEqual(100)
    }
  })

  it('caps at 24 by confidence and reports the hidden count', () => {
    const input = Array.from({ length: 30 }, (_, i) =>
      det(`d-${i}`, { confidence: (i + 1) / 30, createdAt: i + 1 }),
    )
    const result = buildMapPoints(input)
    expect(result.points).toHaveLength(MAP_POINT_LIMIT)
    expect(result.hiddenCount).toBe(6)
    expect(result.points.some(p => p.id === 'd-0')).toBe(false)
    expect(result.points.some(p => p.id === 'd-29')).toBe(true)
  })

  it('has 24 unique anchors', () => {
    expect(MAP_ANCHORS).toHaveLength(24)
    expect(new Set(MAP_ANCHORS.map(a => `${a.x},${a.y}`)).size).toBe(24)
  })
})
```

```ts
// tests/unit/dashboard-chart-data.test.ts
import { describe, expect, it } from 'vitest'
import { buildCategoryMix, buildConfidenceBins, groupCategoryMix } from '@/lib/dashboard/chart-data'
import type { DashboardDetection } from '@/lib/dashboard/types'

function det(category: DashboardDetection['category'], confidence = 0.9): DashboardDetection {
  return {
    id: `${category}-${confidence}`, imageId: 'i', category, material: null,
    confidence, bbox: null, description: '', source: 'vlm',
    reviewStatus: 'confirmed', createdAt: 1,
  }
}

describe('dashboard chart data', () => {
  it('keeps natural in the category mix with its own label', () => {
    const mix = buildCategoryMix([det('plastic_bottle'), det('plastic_bottle'), det('natural')])
    expect(mix).toEqual([
      { category: 'plastic_bottle', label: '塑料瓶', count: 2 },
      { category: 'natural', label: '自然漂浮物', count: 1 },
    ])
  })

  it('bins confidence into five half-open bands, with 1.0 in the last band', () => {
    const bins = buildConfidenceBins([
      det('plastic_bottle', 0.1), det('plastic_bottle', 0.2), det('plastic_bottle', 0.42),
      det('plastic_bottle', 0.5), det('plastic_bottle', 0.79), det('plastic_bottle', 0.8),
      det('plastic_bottle', 0.95), det('plastic_bottle', 1),
    ])
    expect(bins.map(b => b.count)).toEqual([1, 1, 2, 1, 3])
  })

  it('groups everything after the top four into 其余类别', () => {
    const mix = buildCategoryMix([
      ...Array.from({ length: 10 }, () => det('plastic_bottle')),
      ...Array.from({ length: 8 }, () => det('plastic_bag')),
      ...Array.from({ length: 6 }, () => det('fishing_gear')),
      ...Array.from({ length: 4 }, () => det('foam')),
      ...Array.from({ length: 2 }, () => det('metal')),
      ...Array.from({ length: 1 }, () => det('paper')),
    ])
    expect(groupCategoryMix(mix, 5)).toEqual([
      { key: 'plastic_bottle', label: '塑料瓶', count: 10 },
      { key: 'plastic_bag', label: '塑料袋', count: 8 },
      { key: 'fishing_gear', label: '渔网渔具', count: 6 },
      { key: 'foam', label: '泡沫塑料', count: 4 },
      { key: 'rest', label: '其余类别', count: 3 },
    ])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/dashboard-map-points.test.ts tests/unit/dashboard-chart-data.test.ts`
Expected: FAIL，因为模块不存在。

- [ ] **Step 3: 实现类型与纯函数**

`types.ts` 定义：

```ts
export type DashboardRun = {
  id: string
  instruction: string
  location: string | null
  status: RunStatus
  createdAt: number
  isDemo: boolean
  hasReport: boolean
  images: UploadedImage[]
  detections: DashboardDetection[]
}
export type CategoryCount = { category: DebrisCategory; label: string; count: number }
export type ConfidenceBin = { label: string; min: number; max: number; count: number }
export type DashboardStats = {
  totalRuns: number
  totalDetections: number
  pendingLowConfidence: number
  averageConfidence: number
  reportCount: number
  clauseCount: number
  categoryMix: CategoryCount[]
  confidenceBins: ConfidenceBin[]
}
export type DashboardOverview = {
  heroRun: DashboardRun | null
  stats: DashboardStats
  mapPoints: MapPoint[]
  hiddenMapPointCount: number
}
```

`map-points.ts`：
- `MapPoint.id` 与 `MapPoint.detectionId` 都取 `detection.id`，便于测试和弹窗定位。
- 24 个锚点（百分比）按河道走向从左上到右下再回折，使用这些精确值：

```ts
export const MAP_ANCHORS = [
  { x: 12, y: 62 }, { x: 18, y: 57 }, { x: 23, y: 64 }, { x: 28, y: 55 },
  { x: 34, y: 60 }, { x: 39, y: 50 }, { x: 44, y: 56 }, { x: 50, y: 46 },
  { x: 55, y: 52 }, { x: 60, y: 42 }, { x: 65, y: 48 }, { x: 70, y: 38 },
  { x: 74, y: 45 }, { x: 78, y: 35 }, { x: 82, y: 41 }, { x: 86, y: 31 },
  { x: 90, y: 37 }, { x: 93, y: 27 }, { x: 87, y: 22 }, { x: 80, y: 25 },
  { x: 73, y: 28 }, { x: 66, y: 23 }, { x: 58, y: 29 }, { x: 50, y: 33 },
] as const
```
- 排序：先按 `confidence` 降序（同分按 `createdAt` 升序、`id` 升序）取前 24；再把入选点按 `createdAt` 升序、`id` 升序排列后逐一对齐 `MAP_ANCHORS[i]`。
- `severity`：`pending && confidence < 0.5` → `review`；否则 `category === 'natural'` → `natural`；否则 `normal`。
- `label` 用 `CATEGORY_LABELS`。

`chart-data.ts`：
- `buildCategoryMix` 按 count 降序、同分按 label 升序。
- `buildConfidenceBins` 定义五档 `[0,0.2)`、`[0.2,0.4)`、`[0.4,0.6)`、`[0.6,0.8)`、`[0.8,1]`，标签用 `0–20%` 等；`Math.min(4, Math.floor(confidence * 5))` 分档，1.0 落最后一档。
- `groupCategoryMix` 若长度 ≤ maxSlices 原样映射为 `{key: category, label, count}`；否则前 `maxSlices - 1` 个保留，剩余求和为 `{ key: 'rest', label: '其余类别', count }`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/dashboard-map-points.test.ts tests/unit/dashboard-chart-data.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/dashboard tests/unit/dashboard-map-points.test.ts tests/unit/dashboard-chart-data.test.ts
git commit -m "feat: add dashboard view model and map point geometry"
```

---

### Task 4: SQLite 大屏聚合加载器

**Files:**
- Create: `src/lib/dashboard/overview.ts`
- Test: `tests/unit/dashboard-overview.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `DashboardOverview`、`DashboardRun`、`DashboardDetection`、`buildMapPoints`、`buildCategoryMix`、`buildConfidenceBins`；`parseImages`、`parseDetections`、`isPendingLowConfidence`、`ReportDraft`。
- Produces: `loadDashboardOverview(db: Db = getDb()): DashboardOverview`。

- [ ] **Step 1: 写失败测试**

测试用 `createDb(':memory:')` + `migrate` + drizzle insert。至少覆盖：

```ts
it('chooses the latest run that has an analyzed image and non-rejected detections', ...)
it('ignores a newer run whose detections are all rejected', ...)
it('aggregates non-rejected detections and counts only pending low-confidence rows', ...)
it('marks a run as demo only when its latest report parses and source is manual', ...)
it('does not expose a report link for a corrupt report', ...)
it('returns a safe empty overview for an empty database', ...)
```

关键断言：
- hero run id 是最新合格任务；旧任务不会因为更早插入而被选中。
- `stats.totalDetections` 排除 `rejected`，保留 `natural`。
- `stats.pendingLowConfidence === 1`（仅 0.42 且 pending 那条）。
- `stats.reportCount` 按 runId 去重；`stats.clauseCount` 为 clauses 行数。
- `stats.averageConfidence` 为统计范围内算术平均，四舍五入到 3 位。
- `heroRun?.isDemo` 在报告 `source: 'manual'` 时为 true；报告 JSON 损坏或 `source` 缺失时为 false。
- 报告损坏时 `hasReport === false`，避免链接到会 404 的报告页。
- 空库：`heroRun === null`、`mapPoints === []`、所有计数为 0、`categoryMix` 为空、`confidenceBins` 仍固定 5 档且每档 count 为 0。
- `mapPoints` 与 `buildMapPoints(heroRun.detections)` 一致。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/dashboard-overview.test.ts`
Expected: FAIL，因为 `overview.ts` 不存在。

- [ ] **Step 3: 实现加载器**

- 查询全部 `runs`（`createdAt` 降序）、`images`、`detections`、`reports`（`version` 降序、`createdAt` 降序）、`clauses`（只取 id 计数）。
- 用 Map 按 `runId` 分组原始行；`parseImages` / `parseDetections` 解析并丢弃损坏行。
- 每个 run 的非拒绝识别：`detections.filter(d => d.reviewStatus !== 'rejected')`，并附加原始行的 `createdAt`。
- 主任务：按 run 倒序遍历，第一个满足 `images.some(i => i.status === 'analyzed')` 且非拒绝识别数 > 0 的任务。
- 主任务的 `images` 只保留 `status === 'analyzed'`；`detections` 只保留非拒绝。
- 最新报告按 runId 取第一条；只有当 `ReportDraft.safeParse(JSON.parse(contentJson))` 成功时 `hasReport = true`；`isDemo = parsed.data.source === 'manual'`。
- 全库统计对所有 run 的非拒绝识别聚合；`totalRuns = runs.length`；`pendingLowConfidence` 用 `isPendingLowConfidence`；平均置信度 `Math.round((sum / n) * 1000) / 1000`，n 为 0 时取 0。
- 报告数 `new Set(reportRows.map(r => r.runId)).size`；条款数 `clauseRows.length`。
- 空库返回 `heroRun: null`、`mapPoints: []`、`hiddenMapPointCount: 0`、5 个空 confidence bins。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/dashboard-overview.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/lib/dashboard/overview.ts tests/unit/dashboard-overview.test.ts
git commit -m "feat: aggregate dashboard data from sqlite"
```

---

### Task 5: 河道态势地图与点位弹窗

**Files:**
- Create: `src/components/dashboard/river-map.tsx`
- Test: `tests/unit/river-map.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `MapPoint`、`DashboardRun`；Task 1 的 `HoloPanel`、`HoloBadge`。
- Produces:

```ts
export function RiverMap(props: {
  run: DashboardRun | null
  points: MapPoint[]
  hiddenCount: number
  summary: { totalRuns: number; reportCount: number; clauseCount: number }
}): React.ReactElement
```

- [ ] **Step 1: 写失败测试**

```tsx
// tests/unit/river-map.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { RiverMap } from '@/components/dashboard/river-map'
import type { DashboardRun } from '@/lib/dashboard/types'
import type { MapPoint } from '@/lib/dashboard/types'

afterEach(cleanup)

const point = (overrides: Partial<MapPoint> = {}): MapPoint => ({
  id: 'p1', detectionId: 'd1', imageId: 'img1', category: 'plastic_bottle',
  label: '塑料瓶', confidence: 0.92, reviewStatus: 'confirmed',
  severity: 'normal', x: 20, y: 30, ...overrides,
})

const run: DashboardRun = {
  id: 'demo-run-001', instruction: '检查', location: '示例河段 A 段',
  status: 'awaiting_review', createdAt: 1, isDemo: true, hasReport: true,
  images: [], detections: [],
}

describe('RiverMap', () => {
  it('renders one button per point and the illustrative labels', () => {
    render(<RiverMap run={run} points={[point(), point({ id: 'p2', severity: 'review' })]} hiddenCount={0} summary={{ totalRuns: 5, reportCount: 4, clauseCount: 6 }} />)
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(2)
    expect(screen.getByText(/河道与点位为示意/)).toBeInTheDocument()
    expect(screen.getByText(/累计任务 5 · 报告 4 · 标准条款 6/)).toBeInTheDocument()
  })

  it('opens a dialog with real detection data and closes on Escape', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    fireEvent.click(document.querySelector('[data-map-point="p1"]')!)
    expect(screen.getByRole('dialog', { name: '塑料瓶识别详情' })).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '查看完整报告' })).toHaveAttribute('href', '/reports/demo-run-001')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows 报告尚未生成 when the run has no report', () => {
    render(<RiverMap run={{ ...run, hasReport: false }} points={[point()]} hiddenCount={0} summary={{ totalRuns: 1, reportCount: 0, clauseCount: 0 }} />)
    fireEvent.click(document.querySelector('[data-map-point="p1"]')!)
    expect(screen.getByText('报告尚未生成')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看完整报告' })).not.toBeInTheDocument()
  })

  it('renders the empty state without a run', () => {
    render(<RiverMap run={null} points={[]} hiddenCount={0} summary={{ totalRuns: 0, reportCount: 0, clauseCount: 0 }} />)
    expect(screen.getByText('暂无可展示的巡检任务')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-map-point]')).toHaveLength(0)
  })

  it('discloses capped points', () => {
    render(<RiverMap run={run} points={[point()]} hiddenCount={6} summary={{ totalRuns: 1, reportCount: 1, clauseCount: 0 }} />)
    expect(screen.getByText(/展示 1\/7/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/river-map.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现地图**

- 外壳用 `HoloPanel`，标题“河道态势”，副标题“示意航线 · 点位来自真实识别”，右上角 `HoloBadge tone="gold"` 显示任务地点或“暂无任务”。
- SVG `viewBox="0 0 1200 760"`、`preserveAspectRatio="none"`，包含：
  - 远景模糊河道层（`filter: blur` 或低透明路径）；
  - 3–4 条低透明等高线；
  - 主河道带 `RIVER_BAND_PATH`：
    `M -60 660 C 160 590 300 540 430 480 C 610 400 690 360 800 285 C 930 195 1020 180 1260 45 L 1260 205 C 1020 330 940 335 835 415 C 720 505 600 535 440 610 C 300 675 150 720 -60 780 Z`
  - 河岸描边 `RIVER_EDGE_PATH`（同上方第一段曲线）；
  - 金色巡检航线 `PATROL_PATH`：
    `M 20 640 C 210 565 315 505 430 470 C 600 420 705 392 815 310 C 925 228 1035 210 1180 110`
  - 航线使用 `stroke-dasharray` + `holo-route` 动画。
  - 一条极淡的纵向扫描渐变，`holo-scan` 动画。
- 点位是覆盖层中的 `<button data-map-point={id} aria-label={`${label}，置信度 ${pct}%，${statusText}`}>`，绝对定位 `left:${x}%; top:${y}%`，内层脉冲环与核心点；`review` 用洋红，`natural` 用青灰，普通用湖蓝。点击 `event.stopPropagation()` 后打开状态。
- 点击地图空白关闭弹窗。弹窗 `role="dialog"`、`aria-label={`${label}识别详情`}`；显示类别、置信度百分比、复核状态中文、任务 ID、原图缩略图（`next/image`，96×72，`unoptimized`）、`run.hasReport ? <Link href={`/reports/${run.id}`}>查看完整报告</Link> : <span>报告尚未生成</span>`。
- Escape 关闭：`useEffect` 监听 document keydown；打开时记录触发按钮，关闭后 `focus()` 归还；弹窗打开后聚焦第一个可聚焦元素。
- 底部条显示图例（普通/待复核/自然漂浮物）、单个文本节点 `累计任务 ${summary.totalRuns} · 报告 ${summary.reportCount} · 标准条款 ${summary.clauseCount}`，以及 `hiddenCount > 0` 时的 `展示 ${points.length}/${points.length + hiddenCount}`。
- `run === null` 时仍渲染河道骨架，叠加“暂无可展示的巡检任务”，不渲染点位。
- 地图样式全部使用 `holo-*` 类；不要写死浅色。地图容器在 1920 下占满高度，移动端保持 16:10 比例。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/river-map.test.tsx`
Expected: PASS（5 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/components/dashboard/river-map.tsx tests/unit/river-map.test.tsx
git commit -m "feat: add holographic river map and detection popover"
```

---

### Task 6: 巡检影像回放

**Files:**
- Create: `src/components/dashboard/image-replay.tsx`
- Test: `tests/unit/image-replay.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `DashboardRun`；Task 1 的 `HoloPanel`、`HoloBadge`。
- Produces: `ImageReplay({ run }: { run: DashboardRun | null }): React.ReactElement`。

- [ ] **Step 1: 写失败测试**

至少覆盖：
- 渲染“巡检影像回放 · 非实时”“帧 1/2”“任务创建”，不出现伪造的拍摄时间字段。
- 点击“下一帧”切到第 2 帧，并只渲染该帧的识别框。
- 6 秒后自动前进；`prefers-reduced-motion` 时 7 秒后仍停在第 1 帧。
- `run === null` 时显示“暂无巡检影像”。

测试用 `vi.useFakeTimers()` / `vi.useRealTimers()` 与 `act()`；通过按钮名“下一帧”与 `[data-replay-box]` 计数断言。1×1 图片场景不得抛错。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/image-replay.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现回放**

- 仅使用 `run.images`（加载器已过滤为 analyzed）；无图显示空状态。
- 顶部：`HoloBadge tone="magenta"` 文案“巡检影像回放 · 非实时”、`帧 {index + 1}/{total}`、`任务创建 {new Date(run.createdAt).toLocaleString('zh-CN')}`。不要显示实时时钟或伪造拍摄时间。
- 舞台结构：
  - `className="replay-stage"` 底层渲染同图 `<img aria-hidden className="replay-blur">`，`object-fit: cover; filter: blur(22px) brightness(.5)`。
  - 清晰图包裹层 `className="replay-media"` 使用 `position: relative; display: inline-block; line-height: 0; max-width: 100%; max-height: 100%`；内部 `<img className="replay-image" style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}>`。该 `<img>` 前加局部 `/* eslint-disable-next-line @next/next/no-img-element */`，注释说明识别框必须与图片同尺寸。
  - 识别框绝对定位在 `.replay-media` 内，使用 bbox 百分比；`data-replay-box={id}`；待复核加洋红类。
- 控制：上一帧/下一帧按钮、圆点按钮 `aria-label={`查看第 ${n} 帧`}`；悬停与焦点进入暂停，离开恢复。
- 自动前进 `6000ms`；`useEffect` 内检查 `window.matchMedia?.('(prefers-reduced-motion: reduce)').matches`，为 true 不启动 interval；图片数 ≤1 也不启动。
- 样式全部 `.holo-*` 或本组件限定类；扫描框四角与移动扫描线用 CSS。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/image-replay.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/components/dashboard/image-replay.tsx tests/unit/image-replay.test.tsx
git commit -m "feat: add labelled inspection image replay"
```

---

### Task 7: 数据看板（KPI、环形图、置信度折线）

**Files:**
- Create: `src/components/holo/holo-count-up.tsx`
- Create: `src/components/dashboard/stats-board.tsx`
- Test: `tests/unit/stats-board.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 `DashboardStats`、`groupCategoryMix`；Task 1 的 `HoloPanel`、`HoloBadge`。
- Produces:
  - `StatsBoard({ stats }: { stats: DashboardStats }): React.ReactElement`
  - `HoloCountUp({ value, label, decimals = 0, suffix = '', className }: { value: number; label: string; decimals?: number; suffix?: string; className?: string })`

- [ ] **Step 1: 写失败测试**

```tsx
// tests/unit/stats-board.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { StatsBoard } from '@/components/dashboard/stats-board'
import type { DashboardStats } from '@/lib/dashboard/types'

afterEach(cleanup)

const stats: DashboardStats = {
  totalRuns: 5,
  totalDetections: 40,
  pendingLowConfidence: 2,
  averageConfidence: 0.86,
  reportCount: 4,
  clauseCount: 6,
  categoryMix: [
    { category: 'plastic_bottle', label: '塑料瓶', count: 24 },
    { category: 'plastic_bag', label: '塑料袋', count: 7 },
    { category: 'fishing_gear', label: '渔网渔具', count: 4 },
    { category: 'other', label: '其他', count: 3 },
    { category: 'natural', label: '自然漂浮物', count: 2 },
    { category: 'metal', label: '金属', count: 1 },
  ],
  confidenceBins: [
    { label: '0–20%', min: 0, max: 0.2, count: 0 },
    { label: '20–40%', min: 0.2, max: 0.4, count: 1 },
    { label: '40–60%', min: 0.4, max: 0.6, count: 2 },
    { label: '60–80%', min: 0.6, max: 0.8, count: 8 },
    { label: '80–100%', min: 0.8, max: 1, count: 29 },
  ],
}

describe('StatsBoard', () => {
  it('renders the four KPI values from the server stats', () => {
    render(<StatsBoard stats={stats} />)
    expect(document.querySelector('[data-kpi="detections"]')).toHaveTextContent('40')
    expect(document.querySelector('[data-kpi="pending"]')).toHaveTextContent('2')
    expect(document.querySelector('[data-kpi="confidence"]')).toHaveTextContent('86%')
    expect(document.querySelector('[data-kpi="runs"]')).toHaveTextContent('5')
  })

  it('lists grouped slices and keeps the full category counts available', () => {
    render(<StatsBoard stats={stats} />)
    expect(screen.getAllByText('塑料瓶').length).toBeGreaterThan(0)
    expect(screen.getByText('其余类别')).toBeInTheDocument()
    expect(screen.getByText(/金属 1/)).toBeInTheDocument()
  })

  it('renders the confidence bins as a line summary', () => {
    render(<StatsBoard stats={stats} />)
    expect(screen.getByText('80–100%')).toBeInTheDocument()
    expect(screen.getByText(/29 个/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run tests/unit/stats-board.test.tsx`
Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现看板**

- `HoloCountUp` 客户端组件：初始显示 0，`useEffect` 用 `requestAnimationFrame` 在 700ms 内缓动到目标值；`prefers-reduced-motion` 或 `matchMedia` 不可用时直接显示最终值。输出：
  - `<span aria-hidden className="holo-count">{formatted}</span>`
  - `<span className="sr-only">{label}：{finalFormatted}</span>`
- `StatsBoard` 为服务端组件（可导入客户端计数岛）。外层 `HoloPanel title="数据看板" subtitle="全库累计"`，右上角 `HoloBadge tone="cyan"` 显示 `报告 {stats.reportCount} 份`。
- KPI 2×2，`data-kpi` 分别为 `detections`、`pending`、`confidence`、`runs`；标签“累计识别”“待复核”“平均置信度”“巡检任务”。平均置信度显示整数百分比。
- 环形图：`groupCategoryMix(stats.categoryMix, 5)`；内联 SVG `viewBox="0 0 120 120"`，半径 44、圆周周长计算，`strokeDasharray` 分段，段间留 2px 空隙；中心显示 `stats.totalDetections` 与“目标”。系列色固定为 `['#74E6F2','#5AA7FF','#D8BE82','#8CD8C2','#B9C8D8']`，`rest` 使用 `#6E8A91`；`natural` 若单独成片使用 `#8FA6A8`。洋红不参与。
- 环形图下方图例：容器加 `data-slice-legend`，每片色点 + label + count；再放一个 `<details>` “全部类别”列出 `stats.categoryMix` 的全部真实计数。`stats.categoryMix` 为空时显示“暂无识别类别”。
- 折线图：内联 SVG `viewBox="0 0 260 92"`；X 轴 5 档，Y 轴按最大 count 归一化（max 为 0 时取 1）；面积渐变 + 青色折线 + 金色端点；下方显示档位标签与 `count 个` 文本摘要。SVG `aria-hidden`，摘要可见。
- 所有图表容器固定高度，避免布局跳动；小屏字号缩小但不隐藏数据。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run tests/unit/stats-board.test.tsx`
Expected: PASS（3 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/components/holo/holo-count-up.tsx src/components/dashboard/stats-board.tsx tests/unit/stats-board.test.tsx
git commit -m "feat: add holographic KPI and SVG charts"
```

---

### Task 8: 首页大屏装配与 E2E

**Files:**
- Create: `src/components/dashboard/dashboard-hero.tsx`
- Rewrite: `src/app/page.tsx`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: Task 4 的 `loadDashboardOverview`；Task 5 的 `RiverMap`；Task 6 的 `ImageReplay`；Task 7 的 `StatsBoard`；Task 1 的 `HoloPanel`。
- Produces: `DashboardHero({ overview }: { overview: DashboardOverview }): React.ReactElement`；首页 `/` 服务端渲染。

- [ ] **Step 1: 写失败 E2E**

```ts
// tests/e2e/dashboard.spec.ts
import { expect, test } from '@playwright/test'

test('home renders the live-data holographic command screen', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: /全域巡检态势/ })).toBeVisible()
  await expect(page.getByText('巡检影像回放 · 非实时')).toBeVisible()
  await expect(page.getByText(/河道与点位为示意/)).toBeVisible()

  const points = page.locator('[data-map-point]')
  await expect(points).toHaveCount(2)
  await points.first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('link', { name: '查看完整报告' })).toHaveAttribute('href', '/reports/e2e-run-1')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  await expect(page.locator('[data-kpi="detections"]')).toContainText('2')
  await expect(page.locator('[data-kpi="pending"]')).toContainText('1')
  await expect(page.getByText(/累计任务 1 · 报告 1 · 标准条款 0/)).toBeVisible()
})
```

- [ ] **Step 2: 运行 E2E 确认失败**

Run: `npx playwright test tests/e2e/dashboard.spec.ts`
Expected: FAIL，首页仍是旧介绍页。

- [ ] **Step 3: 实现首页**

- `src/app/page.tsx`：`export const dynamic = 'force-dynamic'`；`const overview = loadDashboardOverview()`；return `<DashboardHero overview={overview} />`。删除旧的产品介绍 sections。
- `DashboardHero`：
  - 页头：`<p className="holo-eyebrow">QINGCHUAN · RIVER INSPECTION</p>`、`<h1>全域巡检态势</h1>`、右侧当前主任务状态徽标。
  - 主网格 `.dashboard-grid`：`grid-template-columns: minmax(0,1fr) 400px; gap:20px`；在 1440 下右栏 340px；<1180 单列，顺序地图 → 影像 → 看板。
  - 高度：`calc(100vh - 72px - 48px)`；地图面板 `min-height:0`，右栏 `grid-template-rows: minmax(0,42fr) minmax(0,58fr)`；<1180 时取消固定高度，允许滚动。
  - 地图：`<RiverMap run={overview.heroRun} points={overview.mapPoints} hiddenCount={overview.hiddenMapPointCount} summary={{ totalRuns: overview.stats.totalRuns, reportCount: overview.stats.reportCount, clauseCount: overview.stats.clauseCount }} />`
  - 影像：`<ImageReplay run={overview.heroRun} />`
  - 看板：`<StatsBoard stats={overview.stats} />`
  - 主任务存在且 `isDemo` 时，在页头显示 `HoloBadge tone="gold"` “演示任务 · 人工构造数据”；无主任务时显示“暂无巡检数据”。
- 不添加旧 landing 的营销文案；大屏本身就是首页。

- [ ] **Step 4: 运行 E2E 与单元测试**

Run: `npx playwright test tests/e2e/dashboard.spec.ts`
Expected: PASS。
Run: `npm test`
Expected: 现有测试 + 新增大屏测试全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/page.tsx src/components/dashboard/dashboard-hero.tsx tests/e2e/dashboard.spec.ts
git commit -m "feat: replace landing page with live holographic command screen"
```

---

### Task 9: 巡检工作台换肤

**Files:**
- Modify: `src/app/inspect/page.tsx`
- Modify: `src/components/inspection/upload-dropzone.tsx`
- Modify: `src/components/inspection/instruction-input.tsx`
- Modify: `src/components/inspection/plan-confirm.tsx`
- Modify: `src/components/inspection/evidence-canvas.tsx`
- Modify: `src/components/inspection/detection-list.tsx`
- Modify: `src/components/inspection/agent-timeline.tsx`
- Modify: `src/components/inspection/clause-panel.tsx`
- Modify: `src/components/inspection/review-queue.tsx`
- Modify: `src/components/inspection/voice-input.tsx`

**Interfaces:**
- Consumes: Task 1 的 `.holo-panel`、`.holo-btn`、`.holo-input`、`.holo-label`、`HoloPanel`。
- Produces: 相同 props 与相同可访问名称；无逻辑接口变化。

- [ ] **Step 1: 记录必须保持的测试契约**

在改动前运行并记录以下测试为绿：
Run: `npx vitest run tests/unit/inspection-controls.test.tsx tests/unit/report-link.test.tsx`
Expected: PASS。

必须保留：
- `section aria-label="上传图片"`。
- `input aria-label="选择巡检图片"`。
- 文案 `已选 N/20 张`、`正在上传`、错误文案。
- `section aria-label="Agent 执行时间线"`、`section aria-label="识别结果"`、`section aria-label="标准条款"`、`section aria-label="复核队列"`、`section aria-label="证据画布"`。
- `PlanConfirm` 的 `role="dialog"`、`aria-label="执行计划确认"`、按钮名“开始巡检”“取消”。
- `data-step-status`、`data-detection-id`、`data-review-id`、`data-clause-id`。

- [ ] **Step 2: 重排工作台布局**

- 页头使用 `holo-eyebrow` + `<h1>巡检工作台</h1>` + 说明。
- 未开始时：两栏 `grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)]`。
  - 左：`HoloPanel title="任务投递"` 包裹 UploadDropzone、InstructionInput、VoiceInput、地点输入、生成计划按钮。
  - 右：`HoloPanel title="执行计划"`；有 plan 时渲染 PlanConfirm，否则显示全息空状态“确认巡检要求后生成执行计划”。
- 开始后：保留现有左右结构，左栏证据画布区，右栏时间线/识别/复核/条款，全部用 `HoloPanel` 包裹；保留原有条件与错误提示。
- 移动端单列，顺序与桌面一致。

- [ ] **Step 3: 重做控件样式**

- `UploadDropzone`：大号虚线全息投递框，隐藏原生 input（`sr-only`，仍保留 aria-label），用 label 触发；图标 + “投放或选择巡检照片”；下方进度/错误/计数沿用原文案。不要把 input 从 DOM 移除。
- `InstructionInput`：`.holo-input` 文本域，`aria` 不变。
- 计划确认、开始/取消、生成计划按钮：`.holo-btn` / `.holo-btn--primary` / `.holo-btn--ghost`。
- `EvidenceCanvas`：面板内图片圆角、青色发光边框；识别框普通青、选中金；缩略切换按钮用 `.holo-chip`；保留 `data-detection-id`、`data-highlighted`。
- `DetectionList`、`AgentTimeline`、`ClausePanel`、`ReviewQueue`：暗色面板、细线、洋红复核标签；所有按钮/状态文本与 aria 不变。
- 不使用 `text-destructive` 作为唯一错误信号时，同时保留 `role="alert"`。

- [ ] **Step 4: 运行相关测试与 E2E**

Run: `npx vitest run tests/unit/inspection-controls.test.tsx tests/unit/report-link.test.tsx tests/unit/report-review-panel.test.tsx`
Expected: PASS。
Run: `npx playwright test tests/e2e/inspect.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/inspect/page.tsx src/components/inspection
git commit -m "style: reskin inspection workbench for holographic shell"
```

---

### Task 10: 报告库、报告详情与打印换肤

**Files:**
- Modify: `src/app/reports/page.tsx`
- Modify: `src/app/reports/[id]/page.tsx`
- Modify: `src/app/reports/[id]/print/page.tsx`
- Modify: `src/components/inspection/report-preview.tsx`
- Modify: `src/components/inspection/report-sections.tsx`
- Modify: `src/components/inspection/report-review-panel.tsx`
- Modify: `src/components/inspection/report-evidence-canvas.tsx`
- Modify: `src/components/inspection/regenerate-button.tsx`
- Modify: `src/components/inspection/print-button.tsx`
- Modify: `src/components/inspection/evidence-link.tsx`
- Modify: `src/app/globals.css`（仅打印覆盖）

**Interfaces:**
- Consumes: Task 1 的 `HoloPanel`、`HoloBadge`、`.holo-*`。
- Produces: 相同页面路由、按钮名、aria-label、导出/复核行为。

- [ ] **Step 1: 记录测试契约**

Run: `npx vitest run tests/unit/report-link.test.tsx tests/unit/report-review-panel.test.tsx`
Expected: PASS。

必须保留：
- 报告标题（h1）、`人工构造示例` 提示。
- `导出 PDF`、`重新生成报告`、`还需复核 N 项` 按钮与禁用状态。
- `aria-label="报告指标"`、`"引用标准"`、`"局限性"`、`"证据附录"`、`"报告复核"`、`"重新生成报告"`。
- `data-detection-id`、`data-highlighted`、`data-claim-id`、`data-linked`、`data-clause-id`。
- 打印路线“报告暂不可导出”与正文隐藏逻辑。

- [ ] **Step 2: 报告库与详情换肤**

- `/reports` 页头 `holo-eyebrow` + h1；列表改为悬浮 `HoloPanel` 行卡或 `.holo-report-row`；保留链接、标题、状态文字、时间、严重度/强度。空状态加 `.holo-empty`。
- `/reports/[id]`：返回链接、报告正文放入宽幅 `HoloPanel`；`ReportSections` 内部各 section 用细线卡片，不改变渲染顺序。保留 `ReportPreview` 里的唯一 h1，页面外层不要新增第二个 h1。
- `ReportPreview`：标题、来源标注、指标摘要、claims、footer、导出按钮全部暗色化；`stale`/`exportBlocked` 用洋红或金色文字并保留 role。
- `ReportReviewPanel`、`ReviewQueue`、`RegenerateButton`、`PrintButton`、`EvidenceLink`：统一 `.holo-btn` / `.holo-chip` / 洋红告警；不改变 fetch 逻辑或按钮名。

- [ ] **Step 3: 打印样式**

在 `globals.css` 增加 `@media print`：
```css
@media print {
  html, body { background: #fff !important; color: #111 !important; }
  .holo-backdrop, .holo-nav, .holo-topbar, .holo-panel__actions,
  .holo-scan, .replay-stage, [data-print-hide] { display: none !important; }
  .holo-app, .holo-app__content, .holo-page { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  .holo-panel { background: #fff !important; border: 1px solid #d4d4d4 !important; box-shadow: none !important; backdrop-filter: none !important; border-radius: 0 !important; }
  .holo-panel::before, .holo-panel::after { display: none !important; }
  *, *::before, *::after { text-shadow: none !important; }
  a { color: #111 !important; text-decoration: none !important; }
}
```
- 不删除现有 `print:hidden` / `print:block` 逻辑。
- 打印页保留 `max-width` 与正常分页，不强制单页。

- [ ] **Step 4: 运行测试**

Run: `npx vitest run tests/unit/report-link.test.tsx tests/unit/report-review-panel.test.tsx`
Expected: PASS。
Run: `npx playwright test tests/e2e/report.spec.ts`
Expected: PASS（含打印阻止与复核再生流程）。

- [ ] **Step 5: 提交**

```bash
git add src/app/reports src/components/inspection src/app/globals.css
git commit -m "style: reskin reports and print output"
```

---

### Task 11: 知识库与评测页换肤

**Files:**
- Modify: `src/app/knowledge/page.tsx`
- Modify: `src/app/eval/page.tsx`

**Interfaces:**
- Consumes: Task 1 的 `HoloPanel`、`HoloBadge`、`.holo-input`、`.holo-btn`。
- Produces: 相同检索行为、结果文案、评测数字与 dry-run 警告。

- [ ] **Step 1: 记录行为**

Run: `npx vitest run tests/unit/eval-results.test.ts tests/unit/ingest.test.ts`
Expected: PASS。评测页仅读 `data/eval/results.json`，不得改数字或警告文案。

- [ ] **Step 2: 换肤**

- 知识库：页头、命令式检索条（`.holo-input` + `.holo-btn--primary`），结果条款用 `HoloPanel` 或 `.holo-clause` 线框卡；保留“知识库中未找到依据”“正在检索标准条款…”，错误 `role="alert"`，得分文本。
- 评测：页头、生成时间、未运行命令列表、三组指标卡。指标使用大号数字 + 单位，保留 `P/R/F1`、`Recall@5`、`successRate` 原始数值与 `toFixed(3)`；dry-run 警告保留 `role="alert"` 与原文案。
- 不新增图表；评测数字原样显示。

- [ ] **Step 3: 运行相关测试与构建**

Run: `npx vitest run tests/unit/eval-results.test.ts`
Expected: PASS。
Run: `npm run typecheck`
Expected: exit 0。

- [ ] **Step 4: 提交**

```bash
git add src/app/knowledge/page.tsx src/app/eval/page.tsx
git commit -m "style: reskin knowledge and evaluation pages"
```

---

### Task 12: 响应式、无障碍与全量验证

**Files:**
- Modify: `src/app/globals.css`
- Modify: any responsive issue found in `src/components/dashboard/*`, `src/components/layout/*`, page files
- Test: none new（依赖已有单元/E2E + 人工视口检查）

**Interfaces:**
- Consumes: 全部前序任务。
- Produces: 可直接录制的 1920×1080 大屏与可用的移动端/打印版本。

- [ ] **Step 1: 补齐全局无障碍与响应式规则**

- `:focus-visible`：2px 青色外扩焦点环，`outline-offset:3px`；所有按钮/链接/输入可见。
- `.holo-btn` 最小触控高度 36px；地图点位按钮至少 28×28px 的点击区域（视觉核心可小）。
- `<1180px`：单列；`<1024px`：导航横向，顶栏不固定遮挡；`<640px`：字号降一档、图表保持可读、影像舞台不溢出。
- `prefers-reduced-motion` 下所有 CSS 动画与过渡停止；`HoloCountUp` 与 `ImageReplay` 已有 JS 保护。
- 检查所有洋红只用于告警/待复核；普通图表无洋红。
- 检查没有浅色 token 残留：`grep -R "bg-white\|text-black\|bg-background" src/app src/components` 仅允许打印覆盖或有意保留。

- [ ] **Step 2: 人工视口检查**

启动 `npm run dev`（或沿用 Playwright 的 3100 端口），在以下视口截图到 `.playwright/manual/`：
- 1920×1080：首页、巡检工作台、报告详情、知识库、评测。
- 1440×900、1280×800：首页无横向溢出。
- 390×844：首页单列、导航可操作、地图/影像/看板不重叠。
- 打印预览：报告页白底黑字，无背景光效。

检查项：
- 顶部标题扫光不遮挡文字；地图点位不重叠到不可点；弹窗不超出地图。
- 右侧看板 KPI 与图表在 400px 宽度下不截断。
- 影像窗口的框与图片对齐，低分辨率图不放大成主视觉。
- 所有面板悬浮感一致，没有厚重实线边框。

- [ ] **Step 3: 全量验证**

Run: `npm test`
Expected: 全部 PASS（原 265 + 新增测试）。

Run: `npm run typecheck`
Expected: exit 0。

Run: `npm run lint`
Expected: exit 0（允许既有 warning，不新增 error）。

Run: `npm run build`
Expected: exit 0。

Run: `npx playwright test`
Expected: 4 个测试全部 PASS（原 3 个 + 新增 dashboard 1 个）。

- [ ] **Step 4: 提交收尾**

```bash
git add -A
git commit -m "polish: finish holographic responsive and accessibility pass"
```

> 若 Step 2 发现视觉问题，先修复并在 Step 3 重新全量验证后再提交。不要为了视觉改后端或伪造数据。

---

## 计划自审记录

- **Spec coverage：** 设计文档 §3–§14 均有对应任务：全局视觉/背景→Task 1；壳体/导航/顶栏→Task 2；数据口径/地图/影像/看板→Task 3–8；巡检/报告/知识/评测换肤→Task 9–11；响应式/无障碍/打印/验证→Task 10、12。
- **上限与空态：** 24 点位上限、类别聚合、空库、无报告、损坏报告均有测试。
- **类型一致性：** `DashboardRun`/`DashboardDetection`/`MapPoint`/`DashboardStats` 在 Task 3 定义，Task 4–8 只引用；`buildMapPoints`、`groupCategoryMix` 名称前后一致。
- **技术偏差：** 为全息线框质感与可测试性，图表采用内联 SVG，不使用 Recharts；已在 spec §7.3/§9.3/§12 同步。轮播主图用原生 `<img>` 并局部 lint 豁免，以保证识别框与图片同尺寸；缩略图仍用 `next/image`。
- **人工判断：** 视觉密度、动效节奏、最终截图需在 Task 12 人工检查；自动化测试只保证结构、数据和交互契约。
