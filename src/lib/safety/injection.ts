const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'ignore-instructions', re: /ignore\s+(all\s+)?(previous|above|prior)\s+instructions/i },
  { name: 'system-prompt', re: /(reveal|print|show).{0,20}(system prompt|系统提示词)/i },
  { name: 'role-override', re: /(you are now|从现在开始你是|现在你是一个)/i },
  { name: 'zh-ignore', re: /忽略(以上|之前|前面).{0,10}(指令|提示|规则)/ },
  { name: 'tool-forcing', re: /(call|invoke|执行).{0,20}(shell|rm -rf|curl|wget)/i },
]

export function scanForInjection(text: string): { suspicious: boolean; matches: string[] } {
  const matches = PATTERNS.filter(p => p.re.test(text)).map(p => p.name)
  return { suspicious: matches.length > 0, matches }
}

// Image descriptions are model output derived from untrusted pixels: OCR text
// in a photo can contain instructions ("ignore previous instructions"). The
// reporter must never see them as instructions, and suspicious text is replaced
// with a neutral marker rather than silently forwarded.
export const SUSPICIOUS_DESCRIPTION_MARKER = '[已过滤：图像描述包含可疑指令，未采信]'

export function sanitizeImageDescription(text: string): {
  text: string
  suspicious: boolean
  matches: string[]
} {
  const scan = scanForInjection(text)
  if (scan.suspicious) {
    return { text: SUSPICIOUS_DESCRIPTION_MARKER, suspicious: true, matches: scan.matches }
  }
  return { text, suspicious: false, matches: [] }
}
