import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { HarnessItem, HarnessRow, HarnessDetail, HarnessScope } from '../core/types'
import { slashCommands } from './slash'

/**
 * 하네스 — «이 폴더에서 실제로 쓸 수 있는 것».
 *
 * 🔴 **여기서는 보기만 한다** (2026-09-13 Dave 질문 «폴더별 하네스는 어떻게 보여져야 할지»에 대한 답).
 *    고치는 자리는 그 폴더의 패널이고, 설정의 «하네스» 칸은 **전체를 훑는 표**다.
 *    하네스는 폴더에 딸린 것이라, 설정에 목록으로만 두면 «지금 어느 폴더 이야기인가» 가 사라진다.
 *
 * 🔴 **«붙어 있다» 는 설정에 있다는 뜻뿐이다.** 커넥터가 실제로 떴는지는 봇이 뜰 때 정해지므로
 *    여기서 «연결됨» 이라고 단정하지 않는다 — 화면은 확인 전 상태를 회색 점으로 그린다.
 */

/** 같은 이름이 겹치면 가까운 곳이 이긴다: 폴더 > 볼트 > 사용자 */
const RANK: Record<HarnessScope, number> = { folder: 0, root: 1, user: 2, builtin: 3 }

function readJson(f: string): Record<string, unknown> | null {
  try { return JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown> } catch { return null }
}
/** 한 파일의 mcpServers — `.mcp.json` 도 `~/.claude.json` 도 같은 모양이다 */
function mcpOf(file: string, scope: HarnessScope): HarnessItem[] {
  const j = readJson(file)
  const servers = j?.mcpServers
  if (!servers || typeof servers !== 'object') return []
  return Object.entries(servers as Record<string, unknown>).map(([name, v]) => {
    const c = (v ?? {}) as { command?: string; url?: string; type?: string }
    return { name, desc: c.url ?? (c.command ? `${c.command}` : (c.type ?? '')), scope, kind: 'mcp' as const }
  })
}

/** 폴더 하나가 쓸 수 있는 커넥터 — 폴더 · 볼트 · 사용자 · 내장 */
export function mcpFor(botDir: string, rootDir: string): HarnessItem[] {
  const out: HarnessItem[] = []
  if (botDir !== rootDir) out.push(...mcpOf(join(botDir, '.mcp.json'), 'folder'))
  out.push(...mcpOf(join(rootDir, '.mcp.json'), 'root'))
  out.push(...mcpOf(join(homedir(), '.claude.json'), 'user'))
  out.push({ name: 'Folder Bot', desc: '봇 시작·보내기·할 일 (내장)', scope: 'builtin', kind: 'mcp' })
  const seen = new Set<string>()
  return out.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true))).sort((a, b) => RANK[a.scope] - RANK[b.scope])
}

/** 폴더 하나가 쓸 수 있는 스킬 — 슬래시 목록에서 스킬만 (명령·CLI 제외) */
export function skillsFor(botDir: string, rootDir: string): HarnessItem[] {
  return slashCommands(botDir, rootDir)
    .filter((c) => c.kind === 'skill')
    .map((c) => ({ name: c.name, desc: c.desc, scope: (c.scope === 'cli' ? 'user' : c.scope) as HarnessScope, kind: 'skill' as const }))
    .sort((a, b) => RANK[a.scope] - RANK[b.scope] || a.name.localeCompare(b.name))
}

function countBy(list: HarnessItem[]): HarnessRow['by'] {
  const by = { folder: 0, root: 0, user: 0, builtin: 0 }
  for (const i of list) by[i.scope]++
  return by
}

/** 한 줄 — 표에 쓰는 요약 */
export function harnessRow(rel: string, name: string, section: string, abs: string, rootDir: string): HarnessRow {
  const skills = skillsFor(abs, rootDir), mcp = mcpFor(abs, rootDir)
  return {
    rel, name, section,
    claudeMd: existsSync(join(abs, 'CLAUDE.md')),
    agentsMd: existsSync(join(abs, 'AGENTS.md')),
    skills: skills.length, mcp: mcp.length,
    by: countBy([...skills, ...mcp])
  }
}
/** 한 폴더의 자세한 내역 — 패널이 쓴다 */
export function harnessDetail(rel: string, name: string, section: string, abs: string, rootDir: string): HarnessDetail {
  return { ...harnessRow(rel, name, section, abs, rootDir), skillList: skillsFor(abs, rootDir), mcpList: mcpFor(abs, rootDir) }
}

/** 지침 파일이 무엇이 있나 — 고치기 화면이 쓴다 */
export function guideFiles(abs: string): { name: string; bytes: number }[] {
  const out: { name: string; bytes: number }[] = []
  for (const n of ['CLAUDE.md', 'AGENTS.md']) {
    const f = join(abs, n)
    if (!existsSync(f)) continue
    try { out.push({ name: n, bytes: readFileSync(f).length }) } catch { /* skip */ }
  }
  return out
}

/** 사용자 · 볼트 층에서 쓸 수 있는 것 — 설정 › 에이전트가 쓴다 (폴더와 무관) */
export function globalHarness(rootDir: string): { skills: HarnessItem[]; mcp: HarnessItem[] } {
  return { skills: skillsFor(rootDir, rootDir), mcp: mcpFor(rootDir, rootDir) }
}
