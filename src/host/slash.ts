import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { SlashCmd } from '../core/types'
import { CODEX_LOCAL } from '../core/slashLocal'

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

/**
 * 봇 폴더 → 루트 → 사용자(~/.claude) 순. 같은 이름은 앞(가까운 곳)이 이긴다.
 * cli 는 init 이 준 이름 중 파일에 없는 것.
 *
 * 🔴 **벤더마다 목록이 다르다** (2026-09-13 Dave: «codex 에서는 /clear 와 같은 메시지도 동작을 안해»).
 *    `.claude/` 의 스킬·명령과 `init` 이 준 CLI 명령은 **Claude 의 것**이다 — Codex 세션에
 *    그대로 보여 주면, 고르는 순간 그 글자가 **프롬프트로** 들어가 엉뚱한 답이 온다.
 *    Codex 에는 우리가 직접 처리하는 것(`/clear`)과 **Codex 의 프롬프트 파일**(`$CODEX_HOME/prompts`)만 낸다.
 * ⛔ 없는 기능을 있는 척하지 않는다 — 메뉴에 있는데 아무 일도 안 나면 «고장난 앱» 으로 읽힌다.
 */
export function slashCommands(botDir: string, rootDir: string, cli: string[] = [], vendor: 'claude' | 'codex' = 'claude'): SlashCmd[] {
  const seen = new Set<string>(); const out: SlashCmd[] = []
  const add = (list: SlashCmd[]) => { for (const c of list) if (!seen.has(c.name)) { seen.add(c.name); out.push(c) } }
  if (vendor === 'codex') {
    add(CODEX_LOCAL.map((c) => ({ name: c.name, desc: c.desc, kind: 'cli' as const, scope: 'cli' as const })))
    add(codexPrompts())
    return out
  }
  if (botDir !== rootDir) add(scanOne(botDir, 'folder'))
  add(scanOne(rootDir, 'root'))
  add(scanOne(homedir(), 'user'))
  add(cli.filter((n) => /^[\w:-]+$/.test(n)).map((n) => ({ name: n, desc: CLI_DESC[n] ?? '', kind: 'cli' as const, scope: 'cli' as const })))
  return out
}

/** Codex 의 사용자 프롬프트 — `$CODEX_HOME/prompts/*.md` (Claude 의 `.claude/commands` 에 해당) */
function codexPrompts(): SlashCmd[] {
  const dir = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'prompts')
  if (!existsSync(dir)) return []
  return safeList(dir).filter((n) => n.endsWith('.md')).map((n) => ({ name: n.slice(0, -3), desc: safeDesc(join(dir, n)), kind: 'command' as const, scope: 'user' as const }))
}
const CLI_DESC: Record<string, string> = { compact: '대화 압축 — 컨텍스트 줄이기', context: '컨텍스트 사용 내역', cost: '이번 세션 비용', review: '코드 리뷰', init: 'CLAUDE.md 만들기', clear: '새 대화로', help: '도움말' }

/* ── 슬래시 명령 관리 (루프 8/10) ─────────────────────────────────────────────
   🔴 **명령은 파일이다** — `.claude/commands/<이름>.md`. 만드는 것도 파일 하나 쓰는 것이고, 고치는 것은 문서 열에서 한다.
   ⚠ 이름은 CLI 가 받는 꼴만(`[\w-]`) — 공백·한글 이름은 `/이름` 으로 부를 수 없어 «있는데 안 되는» 명령이 된다.
   ⚠ 있는 파일은 덮지 않는다 — 명령 하나가 곧 사람이 다듬어 온 프롬프트다. */
export interface CmdFile { name: string; desc: string; scope: 'folder' | 'root' | 'user'; abs: string }
export function listCommandFiles(botDir: string, rootDir: string): CmdFile[] {
  const out: CmdFile[] = []
  const one = (dir: string, scope: CmdFile['scope']) => {
    const cmds = join(dir, '.claude', 'commands')
    const walk = (d: string, prefix: string) => { for (const n of safeList(d)) { const p = join(d, n); let st; try { st = statSync(p) } catch { continue } if (st.isDirectory()) walk(p, `${prefix}${n}:`); else if (n.endsWith('.md')) out.push({ name: `${prefix}${n.slice(0, -3)}`, desc: safeDesc(p), scope, abs: p }) } }
    if (existsSync(cmds)) walk(cmds, '')
  }
  if (botDir !== rootDir) one(botDir, 'folder')
  one(rootDir, 'root')
  one(homedir(), 'user')
  return out
}
export const CMD_NAME_RE = /^[\w-]{1,60}$/
export function commandTemplate(name: string, desc: string): string {
  return `---\ndescription: ${desc || '무엇을 하는 명령인지 한 줄'}\n---\n# /${name}\n\n봇이 할 일을 여기에 적으세요. 아래 \`$ARGUMENTS\` 자리에 \`/${name}\` 뒤에 쓴 말이 들어갑니다.\n\n$ARGUMENTS\n`
}
/** 만들고 절대 경로를 돌려준다. 이름이 틀리거나 이미 있으면 던진다 */
export function createCommand(dir: string, name: string, desc = ''): string {
  if (!CMD_NAME_RE.test(name)) throw new Error('이름은 영문·숫자·-·_ 만 (예: daily-report)')
  const cmds = join(dir, '.claude', 'commands'); mkdirSync(cmds, { recursive: true })
  const abs = join(cmds, `${name}.md`)
  if (existsSync(abs)) throw new Error(`/${name} 은 이미 있어요`)
  writeFileSync(abs, commandTemplate(name, desc))
  return abs
}
