import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readResults, writeResults } from '@/lib/eval/results'

describe('eval results file', () => {
  let dir: string
  let file: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qingchuan-eval-results-'))
    file = path.join(dir, 'nested', 'results.json')
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reads a missing file as an empty document', () => {
    expect(readResults(file)).toEqual({})
  })

  it('reads an empty results file as an empty document', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '  \n', 'utf8')

    expect(readResults(file)).toEqual({})
    expect(writeResults('rag', { recallAt5: 1 }, file).rag).toEqual({ recallAt5: 1 })
  })

  it('creates parent directories and writes a valid document with generatedAt', () => {
    const document = writeResults('detection', { precision: 0.5 }, file)

    expect(document.detection).toEqual({ precision: 0.5 })
    expect(Number.isNaN(Date.parse(document.generatedAt ?? ''))).toBe(false)

    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(onDisk.detection).toEqual({ precision: 0.5 })
    expect(onDisk.generatedAt).toBe(document.generatedAt)
    expect(fs.readFileSync(file, 'utf8').endsWith('\n')).toBe(true)
  })

  it('merges new sections without dropping earlier results', () => {
    const first = writeResults('detection', { f1: 0.4 }, file)
    writeResults('rag', { recallAt5: 0.8, total: 35 }, file)
    const third = writeResults('agent', { successRate: 0.75 }, file)

    expect(third.detection).toEqual({ f1: 0.4 })
    expect(third.rag).toEqual({ recallAt5: 0.8, total: 35 })
    expect(third.agent).toEqual({ successRate: 0.75 })
    expect(Date.parse(third.generatedAt ?? '')).toBeGreaterThanOrEqual(Date.parse(first.generatedAt ?? ''))
    expect(readResults(file)).toEqual(third)
  })

  it('overwrites an existing section while preserving the others', () => {
    writeResults('detection', { f1: 0.1 }, file)
    writeResults('rag', { recallAt5: 0.5 }, file)
    const document = writeResults('detection', { f1: 0.9 }, file)

    expect(document.detection).toEqual({ f1: 0.9 })
    expect(document.rag).toEqual({ recallAt5: 0.5 })
    expect(readResults(file)).toEqual(document)
  })

  it('leaves no temporary files behind', () => {
    writeResults('detection', { f1: 0.4 }, file)

    expect(fs.readdirSync(path.dirname(file))).toEqual(['results.json'])
  })

  it('refuses to overwrite a corrupt results file', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{ not json', 'utf8')

    expect(() => readResults(file)).toThrow(/不是合法 JSON/)
    expect(() => writeResults('rag', { recallAt5: 1 }, file)).toThrow(/不是合法 JSON/)
    expect(fs.readFileSync(file, 'utf8')).toBe('{ not json')
    expect(fs.readdirSync(path.dirname(file))).toEqual(['results.json'])
  })

  it('rejects a non-object document', () => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '[]', 'utf8')

    expect(() => readResults(file)).toThrow(/顶层必须是 JSON 对象/)
  })
})
