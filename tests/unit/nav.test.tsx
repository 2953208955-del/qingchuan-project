// @vitest-environment jsdom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { SiteNav } from '@/components/layout/site-nav'
import { AppShell } from '@/components/layout/app-shell'

afterEach(() => {
  cleanup()
})

describe('SiteNav', () => {
  it('renders all workspace links', () => {
    render(<SiteNav />)
    expect(screen.getByRole('link', { name: '巡检工作台' })).toHaveAttribute('href', '/inspect')
    expect(screen.getByRole('link', { name: '报告库' })).toHaveAttribute('href', '/reports')
    expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('href', '/knowledge')
    expect(screen.getByRole('link', { name: '评测' })).toHaveAttribute('href', '/eval')
    expect(screen.getByRole('link', { name: '清川' })).toHaveAttribute('href', '/')
  })
})

describe('AppShell', () => {
  it('renders its children and the site navigation', () => {
    render(
      <AppShell>
        <p>页面内容</p>
      </AppShell>,
    )
    expect(screen.getByText('页面内容')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '巡检工作台' })).toHaveAttribute('href', '/inspect')
  })
})
