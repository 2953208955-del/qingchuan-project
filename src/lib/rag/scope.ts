const STANDARD_RULES: { standardNo: string; pattern: RegExp }[] = [
  {
    standardNo: '清川SOP',
    pattern: /清川\s*SOP|(?<![A-Za-z])SOP(?![A-Za-z])/i,
  },
  {
    standardNo: 'CJJ/T 174-2013',
    pattern: /CJJ\s*\/?\s*T?\s*174(?:\s*[-—–]\s*2013)?/i,
  },
  {
    standardNo: 'DB31/T 1639-2025',
    pattern: /DB31\s*\/?\s*T?\s*1639(?:\s*[-—–]\s*2025)?/i,
  },
  {
    standardNo: 'GB/T 19095-2019',
    pattern: /GB\s*\/?\s*T?\s*19095(?:\s*[-—–]\s*2019)?/i,
  },
]

/**
 * If the user names a standard, retrieval must stay inside that standard.
 * Generic words like "标准" or "国标" are not a scope; otherwise a near-miss
 * question could be answered from a different standard.
 */
export function detectStandardScope(query: string): string[] {
  return STANDARD_RULES
    .filter(rule => rule.pattern.test(query))
    .map(rule => rule.standardNo)
}
