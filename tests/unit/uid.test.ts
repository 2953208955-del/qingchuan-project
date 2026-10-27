import { afterEach, describe, expect, it, vi } from 'vitest'
import { createClientId } from '@/lib/utils/uid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => vi.unstubAllGlobals())

describe('createClientId', () => {
  it('builds a v4 UUID from getRandomValues when randomUUID is unavailable', () => {
    // Plain-http origins (LAN IP) expose getRandomValues but not randomUUID.
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array) => array.fill(0),
    })

    expect(createClientId()).toMatch(UUID_V4)
  })
})
