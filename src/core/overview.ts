/**
 * 오른쪽 패널의 «개요» 칸 (2026-11-13 Dave 카드 · 가안 둘째 묶음).
 *
 * 🔴 **지어내지 않는다** — 모델을 부르지 않고 폴더에 이미 있는 것만 옮긴다.
 *    첫 줄은 `state.md` 의 «현재 목표» 줄 그대로, «내가 나설 곳» 은 답을 기다리는 세션 수 + 봇이 올린 제안 수 +
 *    가장 가까운 마감, «최근 만든 것» 은 봇이 최근 고친 파일 셋.
 * 🔴 **계산은 여기 한 곳**(호스트가 불러 쓴다 · 화면은 받아 그린다 — 리포 계약 «뺄셈은 한 곳에서만»).
 */
export interface Overview {
  /** `state.md` 의 «현재 목표» 줄 — 없으면 칸이 안내 한 줄을 보인다 */
  goal?: string
  /** `state.md` 를 마지막으로 고친 시각 — 개요 발의 출처 줄 */
  goalAt?: number
  mine: { /** 내 답을 기다리는 세션 수 */ asks: number; /** 봇이 올린 제안(아직 안 넣은 할 일) 수 */ proposed: number; /** 열린 할 일 가운데 가장 이른 마감(YYYY-MM-DD) */ due?: string }
  /** 봇이 최근 고친 파일 — 새것이 앞 · 최대 셋 · 봇 폴더 기준 경로 */
  recent: { rel: string; at: number }[]
  hasState: boolean
}

/** 상태 파일은 «만든 것» 이 아니다 — 봇이 턴마다 고쳐서 목록을 다 차지한다 */
const STATUS_FILES = new Set(['state.md', 'state-past.md', 'todo.md'])
export const RECENT_MAX = 3

/**
 * `state.md` 에서 «현재 목표» 줄을 읽는다 — `> 현재 목표: …` 가 규약이고, 인용 표시(`>`)·불릿·굵게가 달라도 읽는다.
 * ⚠ 머리말에 있는 줄이라 앞 40줄만 본다 — 본문 어딘가의 «현재 목표: …» 인용을 집지 않게.
 */
export function goalOf(md: string): string | undefined {
  for (const raw of md.split('\n').slice(0, 40)) {
    const m = /^\s*(?:>\s*)?(?:[-*]\s+)?\**\s*현재 목표\s*\**\s*[:：]\s*\**\s*(.+)$/.exec(raw)
    if (!m) continue
    const g = m[1].replace(/\*\*/g, '').trim()
    if (g) return g
  }
  return undefined
}

/** 열린 정식 할 일 가운데 가장 이른 마감 — 제안과 끝난 줄은 세지 않는다. 지난 마감도 그대로 돌려준다(지났다는 것이 가장 급한 소식이다) */
export function nearestDue(todos: readonly { done: boolean; proposed?: boolean; due?: string }[]): string | undefined {
  let best: string | undefined
  for (const t of todos) {
    if (t.done || t.proposed || !t.due || !/^\d{4}-\d{2}-\d{2}$/.test(t.due)) continue
    if (!best || t.due < best) best = t.due
  }
  return best
}

/**
 * 봇이 최근 고친 파일 — 대화에 남은 «파일» 칩(`kind:'files'`)에서 새것부터 `max` 개.
 * `root` 는 봇 폴더(절대 경로). 폴더 밖(코드 리포 등)과 상태 파일은 뺀다. 한글 경로는 자모 분리(NFD)로 올 수 있어 맞춰서 견준다.
 */
export function recentOf(chips: readonly { t: number; paths: readonly string[] }[], root: string, max = RECENT_MAX): { rel: string; at: number }[] {
  const base = root.normalize('NFC').replace(/\/+$/, '') + '/'
  const out: { rel: string; at: number }[] = []
  const seen = new Set<string>()
  const sorted = [...chips].sort((a, b) => b.t - a.t)
  for (const c of sorted) {
    // 한 턴 안에서는 나중에 고친 것이 뒤에 온다 — 뒤에서부터 본다
    for (let i = c.paths.length - 1; i >= 0; i--) {
      const abs = c.paths[i].normalize('NFC')
      const rel = abs.startsWith(base) ? abs.slice(base.length) : abs.startsWith('/') ? '' : abs
      if (!rel || rel.startsWith('../') || STATUS_FILES.has(rel) || seen.has(rel)) continue
      seen.add(rel); out.push({ rel, at: c.t })
      if (out.length >= max) return out
    }
  }
  return out
}

export function buildOverview(inp: { stateMd: string | null; stateAt?: number; asks: number; todos: readonly { done: boolean; proposed?: boolean; due?: string }[]; chips: readonly { t: number; paths: readonly string[] }[]; root: string }): Overview {
  const goal = inp.stateMd === null ? undefined : goalOf(inp.stateMd)
  const due = nearestDue(inp.todos)
  return {
    ...(goal ? { goal } : {}),
    ...(inp.stateMd !== null && inp.stateAt ? { goalAt: inp.stateAt } : {}),
    mine: { asks: inp.asks, proposed: inp.todos.filter((t) => !t.done && t.proposed).length, ...(due ? { due } : {}) },
    recent: recentOf(inp.chips, inp.root),
    hasState: inp.stateMd !== null
  }
}
