import { describe, expect, it } from 'vitest'
import { detectStandardScope } from '@/lib/rag/scope'

describe('detectStandardScope', () => {
  it('detects the SOP by name', () => {
    expect(detectStandardScope('清川SOP 对严重度怎么规定？')).toEqual(['清川SOP'])
    expect(detectStandardScope('这份 SOP 适用于哪些水体？')).toEqual(['清川SOP'])
  })

  it('detects CJJ, DB31 and GB/T standards with flexible spacing', () => {
    expect(detectStandardScope('CJJ/T 174-2013 规定一级水域每天打捞几次？'))
      .toEqual(['CJJ/T 174-2013'])
    expect(detectStandardScope('DB31/T 1639-2025 的养护等级怎么分？'))
      .toEqual(['DB31/T 1639-2025'])
    expect(detectStandardScope('GB/T 19095-2019 的可回收物包括什么？'))
      .toEqual(['GB/T 19095-2019'])
  })

  it('detects multiple named standards', () => {
    expect(detectStandardScope('对比 CJJ/T 174-2013 和 DB31/T 1639-2025 的保洁频次'))
      .toEqual(['CJJ/T 174-2013', 'DB31/T 1639-2025'])
  })

  it('does not scope on a generic mention of 标准', () => {
    expect(detectStandardScope('河湖保洁标准对垃圾怎么分类？')).toEqual([])
    expect(detectStandardScope('有没有标准依据？')).toEqual([])
  })
})
