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
