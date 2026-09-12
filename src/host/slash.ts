import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SlashCmd } from '../core/types'

/** frontmatter 의 description — 없으면 첫 문단 한 줄 */
function descOf(text: string): string {
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  if (fm) { const m = /^description:\s*(.+)$/m.exec(fm[1]); if (m) return m[1].trim().replace(/^["']|["']$/g, '').slice(0, 120) }
  const body = fm ? text.slice(fm[0].length) : text
  const line = body.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  return (line ?? '').slice(0, 120)
}

/** 한 곳(.claude/) 의 스킬·명령 */
function scanOne(dir: string, scope: SlashCmd['scope']): SlashCmd[] {
  const out: SlashCmd[] = []
  const skills = join(dir, '.claude', 'skills')
  if (existsSync(skills)) for (const n of safeList(skills)) { const f = join(skills, n, 'SKILL.md'); if (existsSync(f)) out.push({ name: n, desc: safeDesc(f), kind: 'skill', scope }) }
  const cmds = join(dir, '.claude', 'commands')
  const walk = (d: string, prefix: string) => { for (const n of safeList(d)) { const p = join(d, n); let st; try { st = statSync(p) } catch { continue } if (st.isDirectory()) walk(p, `${prefix}${n}:`); else if (n.endsWith('.md')) out.push({ name: `${prefix}${n.slice(0, -3)}`, desc: safeDesc(p), kind: 'command', scope }) } }
  if (existsSync(cmds)) walk(cmds, '')
  return out
}
function safeList(d: string): string[] { try { return readdirSync(d).filter((n) => !n.startsWith('.')).sort() } catch { return [] } }
function safeDesc(f: string): string { try { return descOf(readFileSync(f, 'utf8')) } catch { return '' } }

/** 봇 폴더 → 루트 → 사용자(~/.claude) 순. 같은 이름은 앞(가까운 곳)이 이긴다. cli 는 init 이 준 이름 중 파일에 없는 것 */
export function slashCommands(botDir: string, rootDir: string, cli: string[] = []): SlashCmd[] {
  const seen = new Set<string>(); const out: SlashCmd[] = []
  const add = (list: SlashCmd[]) => { for (const c of list) if (!seen.has(c.name)) { seen.add(c.name); out.push(c) } }
  if (botDir !== rootDir) add(scanOne(botDir, 'folder'))
  add(scanOne(rootDir, 'root'))
  add(scanOne(homedir(), 'user'))
  add(cli.filter((n) => /^[\w:-]+$/.test(n)).map((n) => ({ name: n, desc: CLI_DESC[n] ?? '', kind: 'cli' as const, scope: 'cli' as const })))
  return out
}
const CLI_DESC: Record<string, string> = { compact: '대화 압축 — 컨텍스트 줄이기', context: '컨텍스트 사용 내역', cost: '이번 세션 비용', review: '코드 리뷰', init: 'CLAUDE.md 만들기', clear: '새 대화로', help: '도움말' }
