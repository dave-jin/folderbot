import { byDue, dueEnd, type Precision } from './botName'
import { ymd } from './due'
import { rank } from './search'

/**
 * 🔴 **CJ · 홈 네 칸 = 관리 입구 넷** (2026-10-16 Dave «전부 추천대로» · 기획안 `01_기획/2026-10-16_기획_홈-네-칸-재설계와-폰-폴더-찾기.md`).
 * 칸 숫자와 보드 차례, 폰 알약의 폴더 찾기를 여기 한 곳에서 판정한다 — 맥 레일과 폰 홈이 같은 숫자를 보여야 한다.
 */

type DueBot = { id: string; name: string; displayName?: string; due?: { date: string; precision: Precision } | null; todoDue?: string }

/** 폴더의 마감 열쇠 — 레일 «마감일» 정렬(`byDue`)과 같은 규칙: 줄 마감(📅)이 폴더 마감보다 이르면 그것 */
export function folderDue(b: Pick<DueBot, 'due' | 'todoDue'>): string | null {
  const f = dueEnd(b.due), t = b.todoDue ?? null
  return f === null ? t : t === null ? f : t < f ? t : f
}

export const WEEK_DAYS = 7

/**
 * 할 일 칸의 큰 숫자 — **마감이 7일 안에 드는 폴더의 열린 할 일 수** (결정 ① ⓒ).
 * 🔴 전역 규칙 «압박하기 위한 숫자는 쓰지 않는다» — 볼트 전체(약 280건)는 보드 안에서만 보이고, 칸에는 이번 주에 손댈 만큼만 선다.
 * 지난 마감도 든다 — 아직 안 닫힌 일이라 레일 «마감일» 정렬에서도 맨 위다. 제안(`proposed`)은 정식 할 일이 아니라 세지 않는다(호스트가 뺀 `open`).
 * `nearest` 는 작은 줄 «이번 주 마감 · 폴더 D-1» 의 폴더 — 마감이 가장 이른 곳.
 */
export function weekTodo<B extends DueBot>(bots: B[], rows: { botId: string; open: number }[], today = new Date()): { n: number; folders: number; nearest: B | null } {
  const lim = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WEEK_DAYS)
  const edge = ymd(lim)
  const open = new Map(rows.map((r) => [r.botId, r.open]))
  const hit = bots.filter((b) => (open.get(b.id) ?? 0) > 0 && (() => { const k = folderDue(b); return k !== null && k <= edge })()).sort(byDue)
  return { n: hit.reduce((a, b) => a + (open.get(b.id) ?? 0), 0), folders: hit.length, nearest: hit[0] ?? null }
}

/** 보드 거름 — 전체 · 내가 쓴 것(봇 표식 없는 줄) · 봇이 남긴 것(`<!-- bot -->`) */
export type BoardFilter = 'all' | 'me' | 'bot'
export const BOARD_FILTER_LABEL: Record<BoardFilter, string> = { all: '전체', me: '내가 쓴 것', bot: '봇이 남긴 것' }
/** 폴더마다 처음에 펴 두는 줄 수 — 나머지는 «더 보기 N» */
export const BOARD_PEEK = 3

export interface BoardItem { line: number; title: string; desc: string; by: 'me' | 'bot'; due?: string; ak?: string }
export interface BoardRow<B> { bot: B; items: BoardItem[]; total: number }

/**
 * 전체 할 일 보드 — 폴더로 묶고 **마감이 가까운 폴더부터**(레일과 같은 `byDue`).
 * 폴더 안 줄은 파일 차례 그대로 두되 📅 가 박힌 줄을 이른 날부터 앞으로 올린다 — 폴더 머리의 칩이 그 줄에서 왔다.
 * 검색은 제목·설명에서(한글 조합 중 «디ㅋ» 도 걸리는 `core/search`). 거름·검색에 아무 줄도 안 남은 폴더는 뺀다.
 */
export function boardRows<B extends DueBot>(bots: B[], rows: { botId: string; items: BoardItem[] }[], filter: BoardFilter = 'all', q = ''): BoardRow<B>[] {
  const byId = new Map(bots.map((b) => [b.id, b]))
  const out: BoardRow<B>[] = []
  for (const r of rows) {
    const bot = byId.get(r.botId); if (!bot) continue
    let items = r.items.filter((t) => filter === 'all' || t.by === filter)
    if (q.trim()) { const hit = new Set(rank(q, items, (t) => ({ name: t.title, path: `${t.title} ${t.desc}` }), 10_000)); items = items.filter((t) => hit.has(t)) }
    if (!items.length) continue
    const dated = items.filter((t) => t.due).sort((a, b) => (a.due! < b.due! ? -1 : a.due! > b.due! ? 1 : a.line - b.line))
    out.push({ bot, items: [...dated, ...items.filter((t) => !t.due)], total: items.length })
  }
  return out.sort((a, b) => byDue(a.bot, b.bot))
}

/**
 * 폰 알약 «폴더 찾기» (결정 ③ A안) — 표시 이름 · 폴더 경로 · 칸(Projects/Area)에서 찾는다.
 * 조합 중인 한글(«디ㅋ»)도 걸린다(CD 의 자모 비교). 빈 질의면 아무것도 안 걸린다 — 목록은 원래 홈이 보여 준다.
 */
export function findFolders<B extends { displayName?: string; name: string; rel: string; section?: string; orchestrator?: boolean }>(bots: B[], q: string, limit = 50): B[] {
  if (!q.trim()) return []
  return rank(q, bots.filter((b) => !b.orchestrator), (b) => ({ name: b.displayName || b.name, path: `${b.rel} ${b.section ?? ''}` }), limit)
}

/** 알약에서 엔터 — 맞는 폴더가 있으면 맨 위 폴더로, 없으면 친 말을 오케스트레이터에게 보낸다 */
export function pillEnter<B extends { id: string }>(hits: B[], q: string): { go: string } | { ask: string } | null {
  const t = q.trim(); if (!t) return null
  return hits[0] ? { go: hits[0].id } : { ask: t }
}

/** 폴더 현황 시트의 묶음 — 오래 쉼은 마지막 활동이 이만큼 지난 폴더 */
export const IDLE_LONG_DAYS = 14
export type FolderGroup = 'wait' | 'run' | 'idle' | 'rest'
export function folderGroup(state: string | null | undefined, lastActivity: number, now = Date.now()): FolderGroup {
  if (state === 'awaiting_input') return 'wait'
  if (state === 'running') return 'run'
  return now - lastActivity >= IDLE_LONG_DAYS * 86_400_000 ? 'idle' : 'rest'
}
