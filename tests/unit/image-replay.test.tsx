// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { ImageReplay } from '@/components/dashboard/image-replay'
import type { DashboardDetection, DashboardRun } from '@/lib/dashboard/types'
import type { UploadedImage } from '@/lib/domain/schemas'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function image(id: string, filename: string): UploadedImage {
  return {
    id,
    filename,
    path: `data/uploads/${filename}`,
    sha256: 'a'.repeat(64),
    status: 'analyzed',
  }
}

function detection(
  id: string,
  imageId: string,
  overrides: Partial<DashboardDetection> = {},
): DashboardDetection {
  return {
    id,
    imageId,
    category: 'plastic_bottle',
    material: null,
    confidence: 0.92,
    bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.25 },
    description: '',
    source: 'detector',
    reviewStatus: 'confirmed',
    createdAt: 1_700_000_000_000,
    ...overrides,
  }
}

function makeRun(overrides: Partial<DashboardRun> = {}): DashboardRun {
  return {
    id: 'run-1',
    instruction: '检查河道',
    location: '示例河段',
    status: 'awaiting_review',
    // Fixed creation time only; the component must never invent a capture time.
    createdAt: 1_700_000_000_000,
    isDemo: true,
    hasReport: true,
    images: [image('img-1', 'frame-1.jpg'), image('img-2', 'frame-2.jpg')],
    detections: [
      detection('det-1', 'img-1'),
      detection('det-2', 'img-1', {
        confidence: 0.32,
        reviewStatus: 'pending',
        bbox: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
      }),
      detection('det-3', 'img-2', { bbox: { x: 0.3, y: 0.3, w: 0.2, h: 0.2 } }),
    ],
    ...overrides,
  }
}

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

describe('ImageReplay', () => {
  it('labels the replay as non-live and shows only task creation time', () => {
    render(<ImageReplay run={makeRun()} />)

    expect(screen.getByText('巡检影像回放 · 非实时')).toBeInTheDocument()
    expect(screen.getByText('帧 1/2')).toBeInTheDocument()
    expect(screen.getByText(/任务创建/)).toBeInTheDocument()
    expect(screen.queryByText(/拍摄时间|捕获时间/)).not.toBeInTheDocument()
  })

  it('advances manually and only renders the boxes of the current frame', () => {
    render(<ImageReplay run={makeRun()} />)

    expect(document.querySelectorAll('[data-replay-box]')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '下一帧' }))

    expect(screen.getByText('帧 2/2')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-replay-box]')).toHaveLength(1)
    expect(document.querySelector('[data-replay-box="det-3"]')).toBeInTheDocument()
    expect(document.querySelector('[data-replay-box="det-1"]')).not.toBeInTheDocument()
  })

  it('keeps boxes inside the shrink-wrapped media element that holds the sharp image', () => {
    render(<ImageReplay run={makeRun()} />)

    const media = document.querySelector('.replay-media')
    expect(media?.querySelector('.replay-image')).toBeInTheDocument()
    expect(media?.querySelector('[data-replay-box="det-1"]')).toBeInTheDocument()
  })

  it('marks only pending low-confidence boxes as review', () => {
    render(<ImageReplay run={makeRun()} />)

    expect(document.querySelector('[data-replay-box="det-2"]')).toHaveClass('replay-box--review')
    expect(document.querySelector('[data-replay-box="det-1"]')).not.toHaveClass('replay-box--review')
  })

  it('renders a frame whose source is a 1x1 image without throwing', () => {
    const tiny = {
      ...image('img-tiny', '1x1.gif'),
      path: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    }

    expect(() =>
      render(
        <ImageReplay
          run={makeRun({ images: [tiny], detections: [detection('det-tiny', 'img-tiny')] })}
        />,
      ),
    ).not.toThrow()
    expect(screen.getByText('帧 1/1')).toBeInTheDocument()
  })

  it('shows 暂无巡检影像 without a run or without images', () => {
    const { unmount } = render(<ImageReplay run={null} />)
    expect(screen.getByText('暂无巡检影像')).toBeInTheDocument()
    unmount()

    render(<ImageReplay run={makeRun({ images: [], detections: [] })} />)
    expect(screen.getByText('暂无巡检影像')).toBeInTheDocument()
  })

  describe('auto advance', () => {
    it('advances to the next frame after six seconds', () => {
      vi.useFakeTimers()
      render(<ImageReplay run={makeRun()} />)

      expect(screen.getByText('帧 1/2')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByText('帧 2/2')).toBeInTheDocument()
    })

    it('pauses on hover and resumes after the pointer leaves', () => {
      vi.useFakeTimers()
      render(<ImageReplay run={makeRun()} />)

      const stage = document.querySelector('.replay-stage') as HTMLElement
      fireEvent.mouseEnter(stage)
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByText('帧 1/2')).toBeInTheDocument()

      fireEvent.mouseLeave(stage)
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByText('帧 2/2')).toBeInTheDocument()
    })

    it('pauses while focus is inside and resumes when it leaves', () => {
      vi.useFakeTimers()
      render(<ImageReplay run={makeRun()} />)

      const next = screen.getByRole('button', { name: '下一帧' })
      fireEvent.focusIn(next)
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByText('帧 1/2')).toBeInTheDocument()

      fireEvent.focusOut(next)
      act(() => {
        vi.advanceTimersByTime(6000)
      })
      expect(screen.getByText('帧 2/2')).toBeInTheDocument()
    })

    it('stays on the first frame under prefers-reduced-motion', () => {
      vi.useFakeTimers()
      stubReducedMotion(true)
      render(<ImageReplay run={makeRun()} />)

      act(() => {
        vi.advanceTimersByTime(7000)
      })
      expect(screen.getByText('帧 1/2')).toBeInTheDocument()
    })

    it('does not auto-advance when only one frame exists', () => {
      vi.useFakeTimers()
      render(
        <ImageReplay
          run={makeRun({
            images: [image('img-1', 'frame-1.jpg')],
            detections: [detection('det-1', 'img-1')],
          })}
        />,
      )

      act(() => {
        vi.advanceTimersByTime(7000)
      })
      expect(screen.getByText('帧 1/1')).toBeInTheDocument()
    })
  })
})
