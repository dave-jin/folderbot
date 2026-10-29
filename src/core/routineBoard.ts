import { Cron } from 'croner'
import type { RoutineDef } from './types'
import { describeCron, onceAt } from './when'

/**
 * 🔴 **RB · 루틴 관리 페이지의 판정·집계·시간표 — 한 곳** (2026-10-30 Dave: *«시간표를 보면서 리소스가 너무 몰리는건 아닌지 확인하고,
 *    루틴의 성공 및 실패 여부도 확인하고 … 정기보고때도 확인해서 볼 수 있게»*).
 *    페이지(`/api/routines/overview`)·오케스트레이터 도구(`routines_overview`)·정기보고가 **같은 계산**을 읽는다 — 두 벌이면 한쪽이 낡는다.
 *    설계 `2. Area/제품_FolderBot/01_기획/2026-10-30_기획_루틴-관리-페이지.md` §4·§8.
 *
 * ⚠ 몰림은 «10분 칸에 걸친 루틴 수» 가 아니라 **칸 안에서 같은 순간에 동시에 도는 최대 수**다.
 *    걸친 수로 세면 12:00 에 17초 만에 끝난 루틴과 12:05 에 시작한 루틴을 «동시» 로 센다(목업 첫 판이 그렇게 셌다).
 */

/** 실행 기록 한 줄(`host/runs.ts` RunEvent + 시각) — core 는 host 를 안 읽으니 필요한 칸만 */
export interface RunEventLike { ts: string; event: string; botId?: string; bot?: string; routine?: string; run?: string; result?: string; reason?: string; ms?: number; catchup?: string }
export type RunOutcome = 'ok' | 'fail' | 'skip' | 'unknown' | 'timeout'
export interface RunRow { run: string; botId: string; routine: string; start: number; end?: number; result: RunOutcome; reason?: string; ms?: number; catchup: boolean }
export type BoardState = 'fail' | 'missed' | 'unknown' | 'finished' | 'off' | 'ok'
/** 페이지 묶음 순서 — 문제 먼저 */
export const STATE_ORDER: BoardState[] = ['fail', 'missed', 'unknown', 'finished', 'off', 'ok']
export interface BoardRoutine { botId: string; bot: string; name: string; cron: string; when: string; enabled: boolean; once: boolean; next?: number; error?: string
  state: BoardState; firstWait: boolean; last?: RunRow; recent: RunRow[]; avgMs?: number; daveTodo: boolean; changes: ChangeRow[] }
export interface ChangeRow { at: number; botId: string; routine: string; actor: '오케스트레이터' | '이 폴더 봇' | '화면'; what: string; why?: string; before?: Partial<RoutineDef>; after?: Partial<RoutineDef> }

/** 몰림 색 — 3 이상 노랑 · 5 이상 빨강 (설계 §4 · 맥미니가 hermes·크론으로 이미 바쁘다는 전제) */
export const LOAD_WARN = 3
export const LOAD_BAD = 5
/** 걸린 시간 기록이 없는 루틴의 기본값 */
export const DEFAULT_MS = 5 * 60_000
const SLOT_MS = 10 * 60_000
const MIN_MS = 60_000

/** start ↔ end/timeout 을 짝짓는다 · retry 같은 회차 밖 사건은 버린다 · 끝 없는 회차는 end 없이 */
export function pairRuns(events: RunEventLike[]): RunRow[] {
  const by = new Map<string, RunRow>()
  for (const e of events) {
    if (!e.run || !e.botId || !e.routine) continue
    const t = Date.parse(e.ts)
    if (e.event === 'start') { by.set(e.run, { run: e.run, botId: e.botId, routine: e.routine, start: t, result: 'unknown', catchup: !!e.catchup }); continue }
    const r = by.get(e.run); if (!r) continue
    if (e.event === 'timeout') { r.result = 'timeout'; r.end = t }
    else if (e.event === 'end') {
      r.end = t
      r.result = (['ok', 'fail', 'skip', 'unknown'].includes(String(e.result)) ? e.result : 'unknown') as RunOutcome
      if (e.reason) r.reason = e.reason
      if (typeof e.ms === 'number') r.ms = e.ms
    }
  }
  return [...by.values()].sort((a, b) => a.start - b.start)
}

/** RB-2 · `botId::루틴` 마다 가장 늦은 시작 시각 — 다른 호스트가 이미 돌린 회차를 또 보충하지 않게(공유 기록) */
export function latestStarts(events: RunEventLike[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const e of events) { if (e.event !== 'start' || !e.botId || !e.routine) continue; const k = `${e.botId}::${e.routine}`, t = Date.parse(e.ts); if (t > (m.get(k) ?? 0)) m.set(k, t) }
  return m
}

/** `botId::루틴` 마다 최신 먼저 — 폴더 이름이 바뀐 옛 기록도 botId 가 같으면 한 루틴이다 */
export function groupRuns(rows: RunRow[]): Map<string, RunRow[]> {
  const m = new Map<string, RunRow[]>()
  for (const r of rows) { const k = `${r.botId}::${r.routine}`; const l = m.get(k); if (l) l.push(r); else m.set(k, [r]) }
  for (const l of m.values()) l.sort((a, b) => b.start - a.start)
  return m
}

/** 루틴 하나의 묶음 — 순서는 설계 §4 (꺼 둠 → 지난 한 번짜리 → 주기 오류 → 마지막 결과) */
/** 반복 루틴이 예정 시각을 이만큼 넘겨도 돌지 않았으면 «놓침» — 보충이 줄에서 기다릴 틈 */
export const MISSED_GRACE_MS = 30 * 60_000
/** 지금 직전의 예정 시각 — 주기를 못 읽으면 undefined */
export function prevDue(cron: string, now: number): number | undefined {
  try { return new Cron(cron, { paused: true }).previousRuns(1, new Date(now))[0]?.getTime() } catch { return undefined }
}
/**
 * 🔴 최종 리뷰(10/30) · 반복 루틴도 놓침을 판정한다(설계 §5) — `catchup:false` 라 보충하지 않았거나 주인 호스트가 꺼져 있으면
 *    직전 예정 회차(`prevDue`) 뒤로 시작이 없다. 그대로 두면 이틀 안 돌아도 🟢 정상으로 보인다.
 */
export function classify(r: { enabled: boolean; once: boolean; onceAt?: number; error?: string; prevDue?: number }, last: RunRow | undefined, now: number): { state: BoardState; firstWait: boolean } {
  if (!r.enabled) return { state: 'off', firstWait: false }
  const bad = (x?: RunRow) => x?.result === 'fail' || x?.result === 'timeout'
  if (r.once && r.onceAt !== undefined && r.onceAt <= now) {
    if (!last) return { state: 'missed', firstWait: false }
    return { state: bad(last) ? 'fail' : 'finished', firstWait: false }
  }
  if (r.error) return { state: 'fail', firstWait: false }
  if (bad(last)) return { state: 'fail', firstWait: false }
  if (!r.once && last && r.prevDue !== undefined && last.start < r.prevDue - 60_000 && now - r.prevDue > MISSED_GRACE_MS) return { state: 'missed', firstWait: false }
  if (last?.result === 'unknown') return { state: 'unknown', firstWait: false }
  return { state: 'ok', firstWait: !last }
}

/** 결과 이유가 사람이 해야 하는 일(로그인·승인·인증)이면 «Dave 할 일» 로 가른다 */
export function daveTodo(reason: string | undefined): boolean {
  return !!reason && /로그인|승인|인증|비밀번호|권한 필요|Dave/i.test(reason)
}

/** 구간들이 [from, to) 안에서 같은 순간에 겹친 최대 수 (순수 · 끝점 쓸기) */
function peakIn(items: { a: number; b: number }[], from: number, to: number): number {
  const pts: [number, number][] = []
  for (const { a, b } of items) { const s = Math.max(a, from), e = Math.min(b, to); if (s < e) { pts.push([s, 1], [e, -1]) } }
  pts.sort((x, y) => x[0] - y[0] || x[1] - y[1])   // 같은 시각이면 끝(-1)을 먼저 — 맞닿은 둘은 겹치지 않는다
  let n = 0, mx = 0
  for (const [, d] of pts) { n += d; if (n > mx) mx = n }
  return mx
}
const span = (start: number, ms: number) => ({ a: start, b: start + Math.max(ms, MIN_MS) })

/** 하루 144칸(10분) — 칸마다 같은 순간에 동시에 도는 최대 수 */
export function planSlots(items: { start: number; ms: number }[], dayStart: number): number[] {
  const iv = items.map((x) => span(x.start, x.ms))
  return Array.from({ length: 144 }, (_, s) => peakIn(iv, dayStart + s * SLOT_MS, dayStart + (s + 1) * SLOT_MS))
}

/** 한 주 7×24 — 시간대마다 실제로 동시에 돈 최대 수(끝 기록이 없으면 1분으로 친다) */
export function weekGrid(rows: RunRow[], weekStart: number): number[][] {
  const iv = rows.map((r) => ({ a: r.start, b: Math.max(r.end ?? r.start + MIN_MS, r.start + MIN_MS) }))
  return Array.from({ length: 7 }, (_, d) => Array.from({ length: 24 }, (_, h) => { const f = weekStart + (d * 24 + h) * 3_600_000; return peakIn(iv, f, f + 3_600_000) }))
}

/** 그날 이 주기가 도는 시각들 */
export function occurrences(cron: string, dayStart: number): number[] {
  const end = dayStart + 86_400_000
  const once = onceAt(cron)
  if (once) { const t = once.getTime(); return t >= dayStart && t < end ? [t] : [] }
  try {
    const j = new Cron(cron, { paused: true }); const out: number[] = []
    let d = j.nextRun(new Date(dayStart - 1))
    while (d && d.getTime() < end && out.length < 1440) { out.push(d.getTime()); d = j.nextRun(d) }
    j.stop(); return out
  } catch { return [] }
}

/**
 * 몰림 제안 — 3 이상 겹치는 날이면, 겹친 칸에 가장 많이 걸린 루틴(분 칸이 숫자 하나인 것)의 분을 +5…+15 옮겨 보고
 * **모든 칸이 2 이하가 되는 가장 작은 값**을 고른다. 없으면 null. 화면이 [옮기기] 로 쓴다(설계 목업 ①).
 */
export function suggestShift(plan: { botId: string; name: string; cron: string; ms: number }[], dayStart: number): { botId: string; name: string; from: string; to: string } | null {
  const build = (p: typeof plan) => p.flatMap((x) => occurrences(x.cron, dayStart).map((t) => ({ who: `${x.botId}::${x.name}`, start: t, ms: x.ms })))
  const peak = (p: typeof plan) => Math.max(0, ...planSlots(build(p), dayStart))
  if (peak(plan) < LOAD_WARN) return null
  const slots = planSlots(build(plan), dayStart)
  const hits = new Map<string, number>()
  for (const o of build(plan)) {
    const s0 = Math.floor((o.start - dayStart) / SLOT_MS), s1 = Math.floor((o.start + Math.max(o.ms, MIN_MS) - 1 - dayStart) / SLOT_MS)
    for (let s = Math.max(0, s0); s <= Math.min(143, s1); s++) if (slots[s] >= LOAD_WARN) hits.set(o.who, (hits.get(o.who) ?? 0) + 1)
  }
  const cand = plan.filter((x) => /^\d+$/.test(x.cron.trim().split(/\s+/)[0] ?? '') && x.cron.trim().split(/\s+/).length === 5 && hits.has(`${x.botId}::${x.name}`))
    .sort((a, b) => (hits.get(`${b.botId}::${b.name}`) ?? 0) - (hits.get(`${a.botId}::${a.name}`) ?? 0))
  for (const c of cand) {
    const f = c.cron.trim().split(/\s+/), m = Number(f[0])
    for (let d = 5; d <= 15; d++) {
      if (m + d > 59) break
      const to = [String(m + d), ...f.slice(1)].join(' ')
      if (peak(plan.map((x) => (x === c ? { ...x, cron: to } : x))) < LOAD_WARN) return { botId: c.botId, name: c.name, from: c.cron, to }
    }
  }
  return null
}

/**
 * RB-4 · 정기보고 «⏰ 루틴» 덩이의 첫 줄 (2026-10-30 Dave «전체 요약 + 문제») — 오케스트레이터 `routines_overview` 가 돌려준다.
 *    `since` 이후 시작해 끝난 회차를 센다 · 가장 몰린 때는 그 회차들이 같은 순간 겹친 최대 · 오늘 예정 겹침은 `LOAD_WARN` 이상인 시(時) 수.
 */
export function boardSummary(rows: RunRow[], since: number, now: number, todaySlots: number[]): string {
  const done = rows.filter((r) => r.start >= since && r.start <= now && r.end !== undefined)
  const n = (f: (r: RunRow) => boolean) => done.filter(f).length
  const parts = [`지난 보고 뒤 ${done.length}회`]
  if (done.length) {
    parts.push(`성공 ${n((r) => r.result === 'ok')}`, `건너뜀 ${n((r) => r.result === 'skip')}`, `실패 ${n((r) => r.result === 'fail' || r.result === 'timeout')}`, `결과 없음 ${n((r) => r.result === 'unknown')}`)
    const pts: [number, number][] = done.flatMap((r) => [[r.start, 1], [Math.max(r.end!, r.start + MIN_MS), -1]] as [number, number][]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let c = 0, mx = 0, when = 0
    for (const [t, d] of pts) { c += d; if (c > mx) { mx = c; when = t } }
    const d = new Date(when)
    parts.push(`가장 몰린 때 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} (${mx}개)`)
  }
  const hours = [...new Set(todaySlots.map((v, i) => (v >= LOAD_WARN ? Math.floor(i / 6) : -1)).filter((h) => h >= 0))]
  if (hours.length) parts.push(`오늘 예정 겹침 ${LOAD_WARN}개 이상 ${hours.length}번 (${hours.map((h) => String(h).padStart(2, '0')).join('·')}시)`)
  return parts.join(' · ')
}

/** RB-4·5 · 루틴 하나가 무엇이 바뀌었나 — 사람 말 한 줄(변경 기록 · CLAUDE.md 구역) */
export function changeWhat(before: RoutineDef, after: RoutineDef): string {
  const w: string[] = []
  if (before.cron !== after.cron) w.push(`시각 ${describeCron(before.cron)} → ${describeCron(after.cron)}`)
  if ((before.enabled !== false) !== (after.enabled !== false)) w.push(after.enabled === false ? '껐음' : '켰음')
  if (before.prompt !== after.prompt) w.push('문구 바뀜')
  if (!!before.push !== !!after.push) w.push(after.push ? '알림 켬' : '알림 끔')
  return w.join(' · ')
}
/** RB-5 · 화면이 루틴 목록을 통째로 저장했을 때의 전후 비교 — 안 바뀐 루틴은 빠진다 · 바뀐 것 → 지운 것 → 새로 건 것 순 */
export function diffRoutines(before: RoutineDef[], after: RoutineDef[]): { routine: string; what: string; before?: RoutineDef; after?: RoutineDef }[] {
  const out: { routine: string; what: string; before?: RoutineDef; after?: RoutineDef }[] = []
  for (const a of after) { const b = before.find((x) => x.name === a.name); if (b) { const w = changeWhat(b, a); if (w) out.push({ routine: a.name, what: w, before: b, after: a }) } }
  for (const b of before) if (!after.some((x) => x.name === b.name)) out.push({ routine: b.name, what: '지움', before: b })
  for (const a of after) if (!before.some((x) => x.name === a.name)) out.push({ routine: a.name, what: '새로 걸림', after: a })
  return out
}
