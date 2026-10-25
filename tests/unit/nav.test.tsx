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

  it('exposes one named navigation landmark with named groups', () => {
    render(<SiteNav />)
    expect(screen.getAllByRole('navigation')).toHaveLength(1)
    expect(screen.getByRole('navigation', { name: '主导航' })).toBeInTheDocument()
    expect(screen.queryByRole('complementary', { name: '导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: '总览' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '巡检作业' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '知识中枢' })).toBeInTheDocument()
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
