import { describe, it, expect } from 'vitest'
import { parseSseChunk } from '@/lib/agent/sse-parse'

describe('parseSseChunk', () => {
  it('parses complete events and keeps the rest', () => {
    const raw = 'event: step\ndata: {"type":"step","runId":"r1"}\n\npartial'
    const { events, rest } = parseSseChunk(raw)
    expect(events).toHaveLength(1)
    expect(events[0].runId).toBe('r1')
    expect(rest).toBe('partial')
  })

  it('parses multiple complete events in a single chunk and keeps the tail', () => {
    const raw = [
      'event: step\ndata: {"type":"step","runId":"r1"}',
      'event: done\ndata: {"type":"done","runId":"r1","status":"completed"}',
      'event: step\ndata: {"type":"ste',
    ].join('\n\n')
    const { events, rest } = parseSseChunk(raw)
    expect(events.map(event => event.type)).toEqual(['step', 'done'])
    expect(rest).toBe('event: step\ndata: {"type":"ste')
  })

  it('holds an unterminated event in the rest buffer', () => {
    const raw = 'event: step\ndata: {"type":"step","runId":"r1"}'
    const { events, rest } = parseSseChunk(raw)
    expect(events).toHaveLength(0)
    expect(rest).toBe(raw)
  })

  it('skips malformed json without dropping later events', () => {
    const raw = [
      'event: step\ndata: {not json',
      'event: done\ndata: {"type":"done","runId":"r1","status":"completed"}',
      '',
    ].join('\n\n')
    const { events, rest } = parseSseChunk(raw)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'done', status: 'completed' })
    expect(rest).toBe('')
  })

  it('handles data lines without a space and crlf framing', () => {
    const raw = 'event: step\r\ndata:{"type":"step","runId":"r1"}\r\n\r\n'
    const { events, rest } = parseSseChunk(raw)
    expect(events).toHaveLength(1)
    expect(events[0].runId).toBe('r1')
    expect(rest).toBe('')
  })

  it('returns an empty result for empty input', () => {
    expect(parseSseChunk('')).toEqual({ events: [], rest: '' })
  })
})
