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
