import type { Bot, RoutineDef } from '../core/types'
import { describeCron, isOnce, onceAt } from '../core/when'
import { DEFAULT_MS, STATE_ORDER, classify, daveTodo, groupRuns, occurrences, pairRuns, planSlots, suggestShift, weekGrid,
  type BoardRoutine, type BoardState, type ChangeRow, type RunEventLike, type RunRow } from '../core/routineBoard'

/**
 * RB-5 · 루틴 보드 한 장 — 페이지(`/api/routines/overview`)·오케스트레이터(`routines_overview`)·정기보고가 같은 값을 본다(설계 §8).
 *    입력: 봇 목록 + 스케줄러가 얹은 값(decorate · nextRun·lastError) + 실행 기록(이번 달·지난달) + 변경 기록.
 */
export interface Board {
  now: number; routines: BoardRoutine[]
  today: { dayStart: number; slots: number[]; blocks: { botId: string; name: string; start: number; ms: number; result?: RunRow['result'] }[] }
  week: { weekStart: number; grid: number[][]; peak: { day: number; hour: number; n: number } }
  suggest: ReturnType<typeof suggestShift>; counts: Record<BoardState, number>; total: number; folders: number
  /** 루틴이 있는데 구역을 쓸 CLAUDE.md 가 없는 봇 — 폴더 봇이 루틴 변경을 모를 수 있다 */
  noteMissing: string[]
}
const DAY = 86_400_000

export function buildBoard(bots: Bot[], decorate: (botId: string, r: RoutineDef[]) => RoutineDef[], events: RunEventLike[], changes: ChangeRow[], now: number, hasNote: (b: Bot) => boolean = () => true): Board {
  const rows = pairRuns(events), groups = groupRuns(rows)
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const dayStart = d0.getTime()
  const routines: BoardRoutine[] = [], plan: { botId: string; name: string; cron: string; ms: number }[] = []
  const blocks: Board['today']['blocks'] = []
  for (const b of bots) for (const r of decorate(b.id, b.routines)) {
    const once = isOnce(r.cron), oAt = onceAt(r.cron)?.getTime(), enabled = r.enabled !== false
    const all = groups.get(`${b.id}::${r.name}`) ?? [], recent = all.filter((x) => x.start >= now - 7 * DAY && x.start <= now)
    const last = all.find((x) => x.start <= now)
    const durs = recent.filter((x) => x.end !== undefined).map((x) => x.ms ?? x.end! - x.start)
    const avgMs = durs.length ? Math.round(durs.reduce((p, c) => p + c, 0) / durs.length) : undefined
    const { state, firstWait } = classify({ enabled, once, ...(oAt !== undefined ? { onceAt: oAt } : {}), ...(!once && r.lastError ? { error: r.lastError } : {}) }, last, now)
    routines.push({ botId: b.id, bot: b.name, name: r.name, cron: r.cron, when: describeCron(r.cron), enabled, once, ...(r.nextRun ? { next: r.nextRun } : {}), ...(r.lastError ? { error: r.lastError } : {}),
      state, firstWait, ...(last ? { last } : {}), recent, ...(avgMs !== undefined ? { avgMs } : {}), daveTodo: state === 'fail' && daveTodo(last?.reason),
      changes: changes.filter((c) => c.botId === b.id && c.routine === r.name).sort((x, y) => y.at - x.at).slice(0, 5) })
    if (!enabled) continue
    const ms = avgMs ?? DEFAULT_MS
    plan.push({ botId: b.id, name: r.name, cron: r.cron, ms })
    for (const x of all) if (x.start >= dayStart && x.start <= now) blocks.push({ botId: b.id, name: r.name, start: x.start, ms: x.end !== undefined ? x.end - x.start : Math.max(now - x.start, 60_000), result: x.result })
    for (const t of occurrences(r.cron, dayStart)) if (t > now) blocks.push({ botId: b.id, name: r.name, start: t, ms })
  }
  routines.sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) || (a.next ?? Infinity) - (b.next ?? Infinity) || a.name.localeCompare(b.name))
  const weekStart = dayStart - 7 * DAY
  const grid = weekGrid(rows.filter((x) => x.start >= weekStart && x.start < dayStart), weekStart)
  let peak = { day: 0, hour: 0, n: 0 }
  grid.forEach((row, d) => row.forEach((n, h) => { if (n > peak.n) peak = { day: d, hour: h, n } }))
  const counts = Object.fromEntries(STATE_ORDER.map((s) => [s, routines.filter((r) => r.state === s).length])) as Record<BoardState, number>
  const withR = bots.filter((b) => b.routines.length)
  return { now, routines, today: { dayStart, slots: planSlots(blocks, dayStart), blocks }, week: { weekStart, grid, peak }, suggest: suggestShift(plan, dayStart),
    counts, total: routines.length, folders: withR.length, noteMissing: withR.filter((b) => !hasNote(b)).map((b) => b.id) }
}
