/**
 * 맥락 상황판 — «맥락 상황판» 1단계 (2026-11-01).
 * 폴더별 카드·작업·`state.md` 줄을 모아 **목표 카드 · 내가 나설 곳 · 이야기 · 함께 가는 맥락 · board.md** 의 자료로 만든다.
 *
 * ⚠ **순수 모듈이다 — IO 도 모델 호출도 `Date.now()` 도 없다.** 시각은 `now` 로 들어오고, 디스크를 읽는 일은 뒤 과제(ContextService)가 한다.
 * ⛔ 글 칸은 모두 `maskSensitive` 를 거치고, 퍼센트 글자(`%`)는 어디에도 싣지 않는다 — 숫자는 개수로만 말한다.
 */
import { maskSensitive, type CardChannel, type EvidenceKind, type SessionCard } from './contextCard'
import type { CtxTask, FolderTasks, TaskState } from './contextTasks'
import type { BoardRoutine } from './routineBoard'

/** today = 지난 24시간 · week = 7일 · away = Dave 가 마지막으로 상황판을 연 뒤 */
export type Period = 'today' | 'week' | 'away'

/** 나설 곳 한 덩이에 보이는 줄 수 — 나머지는 «외 N» */
export const STEP_ROWS = 3
/** [놔둬] 로 나설 곳에서 빼는 기간 */
export const SNOOZE_MS = 7 * 86_400_000
/** 하다 만 일이 이만큼 조용하면 나설 곳에서 접는다 */
export const FOLD_MS = 14 * 86_400_000
/** `state.md` 의 «현재 목표» 가 이 안에 고쳐졌으면 믿는다 */
export const GOAL_FRESH_MS = 14 * 86_400_000
/** 스텁이 이 표지로 갈래를 고른다 */
export const AXIS_MARK = '[[folderbot:context-axis]]'

const BRIEF_MAX = 2000
const TASK_STATES: readonly TaskState[] = ['done', 'claimed', 'running', 'stalled', 'waiting', 'todo']
const STATE_KO: Record<TaskState, string> = {
  done: '끝남', claimed: '끝났다고 함', running: '하는 중', stalled: '하다 멈춤', waiting: '내 답 대기', todo: '아직'
}
const PERIOD_KO: Record<Period, string> = { today: '지난 24시간', week: '지난 7일', away: '자리를 비운 사이' }

export interface FolderInput {
  botId: string; folder: string; due: string | null; tasks: FolderTasks; cards: SessionCard[]
  goal: { text: string; from: 'state' | 'claude' | 'none' }
  /** state.md 「📤 오케스트레이터에게」 줄 */
  outbox: { at: number; text: string }[]
}
export interface GoalCard {
  botId: string; folder: string; goal: string; goalFrom: 'state' | 'claude' | 'none'; due: string
  counts: Record<TaskState, number>; gap: string | null; just: string | null; next: string | null
  chips: { sessions: number; routines: number }; problem: boolean; lastAt: number
  tasks: { id: string; title: string; state: TaskState; lastAt: number; cards: number }[]
}
export interface StepRow {
  kind: 'stalled' | 'waiting' | 'routine'; botId: string; folder: string
  taskId?: string; sessionId?: string; routine?: string; title: string; line: string; at: number
}
export interface StepGroup { rows: StepRow[]; more: number }
export interface Board {
  v: 1; at: number; host: string; period: Period; since: number
  axis: { text: string; at: number } | null
  tally: { done: number; stalled: number; added: number }
  step: { stalled: StepGroup; waiting: StepGroup; routine: StepGroup }
  goals: GoalCard[]; quiet: string[]
  sources: { name: string; ok: boolean; at: number | null; note?: string }[]
}
export interface StoryRow {
  at: number; channel: CardChannel | 'file'; machine: string; text: string; stalled: boolean
  /** `ownerBot` = 그 세션의 주인 봇(호스트가 채운다) — 오케스트레이터 조각 카드는 폴더 판에 있어도 주인이 오케스트레이터다 */
  ref: { sessionId: string; itemId?: string; ownerBot?: string } | { file: string }; ev?: EvidenceKind
}

/** 가림 + 퍼센트 글자 제거 — 판에 들어가는 모든 글이 지난다 */
const clean = (s: string): string => maskSensitive(s).replace(/%/g, '퍼센트')

// ── 목표 한 줄 · 보낸 줄 ──────────────────────────────────────────────────────

/** `state.md` 현재 목표(신선할 때) → `CLAUDE.md` 목적 첫 문장 → 목적 미정 */
export function goalLine(stateMd: string | null, stateMtime: number | null, claudeMd: string | null, now: number): FolderInput['goal'] {
  if (stateMd && stateMtime !== null && now - stateMtime <= GOAL_FRESH_MS) {
    const m = /^>[ \t]*현재 목표:[ \t]*(\S.*?)[ \t]*$/m.exec(stateMd)
    if (m && m[1].trim()) return { text: clean(m[1].trim()), from: 'state' }
  }
  const first = claudeMd ? purposeSentence(claudeMd) : null
  if (first) return { text: clean(first), from: 'claude' }
  return { text: '목적 미정', from: 'none' }
}

/** `## 🎯 목적…` 절의 첫 문장 */
function purposeSentence(md: string): string | null {
  const lines = md.split('\n')
  const at = lines.findIndex((l) => /^##\s+🎯\s*목적/.test(l))
  if (at < 0) return null
  for (let i = at + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    const line = lines[i].replace(/^\s*(?:[-*>]|\d+\.)\s*/, '').replace(/\*\*/g, '').trim()
    if (!line) continue
    const m = /^(.+?[.!?。])(?:\s|$)/.exec(line)
    return (m ? m[1] : line).trim()
  }
  return null
}

/**
 * `## 📤 오케스트레이터에게` 절의 `- [M/D HH:MM] 글 | …` 줄. 시각은 로컬.
 * 연도는 부르는 쪽이 고른다 — 12월 줄을 1월에 읽는 경우는 부르는 쪽 몫이다. 없는 날짜·시각 줄은 건너뛴다.
 */
export function outboxLines(stateMd: string | null, year: number): FolderInput['outbox'] {
  if (!stateMd) return []
  const out: FolderInput['outbox'] = []
  let inside = false
  for (const raw of stateMd.split('\n')) {
    if (/^##\s/.test(raw)) { inside = /^##\s+📤\s*오케스트레이터에게/.test(raw); continue }
    if (!inside) continue
    const m = /^\s*-\s*\[(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\]\s*(.+?)\s*$/.exec(raw)
    if (!m) continue
    const [mo, da, hh, mm] = [+m[1], +m[2], +m[3], +m[4]]
    if (mo < 1 || mo > 12 || da < 1 || da > 31 || hh > 23 || mm > 59) continue
    const at = new Date(year, mo - 1, da, hh, mm)
    if (at.getMonth() !== mo - 1 || at.getDate() !== da) continue // 2/30 처럼 굴러 넘어가는 날짜
    const text = m[5].split(' | ')[0].trim()
    if (!text) continue
    out.push({ at: at.getTime(), text: clean(text) })
  }
  return out
}

// ── 판 ────────────────────────────────────────────────────────────────────────

const group = (rows: StepRow[]): StepGroup => ({ rows: rows.slice(0, STEP_ROWS), more: Math.max(0, rows.length - STEP_ROWS) })

function goalCard(f: FolderInput, since: number): GoalCard {
  const counts = Object.fromEntries(TASK_STATES.map((s) => [s, 0])) as Record<TaskState, number>
  for (const t of f.tasks.tasks) counts[t.state]++
  const recent = f.cards.filter((c) => c.to >= since)
  const just = f.tasks.tasks.filter((t) => (t.state === 'done' || t.state === 'claimed') && t.lastAt >= since).sort((a, b) => b.lastAt - a.lastAt)[0]
  const open = f.tasks.tasks.filter((t) => t.state !== 'done' && t.state !== 'claimed').sort((a, b) => b.lastAt - a.lastAt)[0]
  return {
    botId: f.botId, folder: clean(f.folder), goal: clean(f.goal.text), goalFrom: f.goal.from, due: f.due ?? '상시',
    counts, gap: f.tasks.gap ? clean(f.tasks.gap) : null,
    just: just ? clean(just.title) : null,
    next: open ? clean(open.missing || open.title) : null,
    chips: {
      sessions: new Set(recent.filter((c) => c.channel !== 'routine').map((c) => c.sessionId)).size,
      routines: new Set(recent.filter((c) => c.channel === 'routine').map((c) => c.taskHint)).size
    },
    problem: f.tasks.tasks.some((t) => t.state === 'stalled' || t.state === 'claimed' || t.state === 'waiting'),
    lastAt: f.cards.reduce((m, c) => Math.max(m, c.to), 0),
    tasks: f.tasks.tasks.map((t) => ({ id: t.id, title: clean(t.title), state: t.state, lastAt: t.lastAt, cards: t.cards.length }))
  }
}

function stalledLine(t: CtxTask): string {
  const rest = t.missing || t.summary
  if (t.state === 'claimed') return clean(rest ? `끝났다고 함 — ${rest}` : '끝났다고 함 — 근거가 안 보임')
  return clean(rest || STATE_KO.stalled)
}

export function buildBoard(i: {
  folders: FolderInput[]; waiting: { botId: string; folder: string; sessionId: string; name: string; at: number }[]
  routines: BoardRoutine[]; period: Period; since: number; now: number; host: string; axis: Board['axis']; sources: Board['sources']
}): Board {
  const { since, now } = i
  const quiet: string[] = []
  const goals: GoalCard[] = []
  for (const f of i.folders) {
    if (f.cards.some((c) => c.to >= since)) goals.push(goalCard(f, since))
    else quiet.push(clean(f.folder))
  }
  goals.sort((a, b) => {
    if (a.problem !== b.problem) return a.problem ? -1 : 1
    const sa = a.due === '상시', sb = b.due === '상시'
    if (sa !== sb) return sa ? 1 : -1
    if (a.due !== b.due) return a.due < b.due ? -1 : 1
    return b.lastAt - a.lastAt
  })

  // 하다 만 일 — stalled·claimed, 놔둔 것·14일 넘게 조용한 것 빼고
  const stalled: StepRow[] = []
  for (const f of i.folders) {
    for (const t of f.tasks.tasks) {
      if (t.state !== 'stalled' && t.state !== 'claimed') continue
      if ((f.tasks.snooze[t.id] ?? 0) > now) continue
      if (t.lastAt < now - FOLD_MS) continue
      stalled.push({ kind: 'stalled', botId: f.botId, folder: clean(f.folder), taskId: t.id, title: clean(t.title), line: stalledLine(t), at: t.lastAt })
    }
  }
  stalled.sort((a, b) => b.at - a.at)

  // 내 답 대기 — 같은 세션은 가장 최근 한 줄
  const bySession = new Map<string, (typeof i.waiting)[number]>()
  for (const w of i.waiting) {
    const prev = bySession.get(w.sessionId)
    if (!prev || w.at > prev.at) bySession.set(w.sessionId, w)
  }
  const waiting: StepRow[] = [...bySession.values()].sort((a, b) => b.at - a.at)
    .map((w) => ({ kind: 'waiting' as const, botId: w.botId, folder: clean(w.folder), sessionId: w.sessionId, title: clean(w.name), line: '내 답을 기다리는 중', at: w.at }))

  // 어긋난 루틴 — 한 루틴은 한 줄 (1단계 판정: fail·missed 만)
  const latest = new Map<string, StepRow>()
  for (const r of i.routines) {
    if (r.state !== 'fail' && r.state !== 'missed') continue
    const why = r.last?.reason ?? r.error
    const head = r.state === 'fail' ? '실패했어요' : '돌아야 할 때 안 돌았어요'
    const row: StepRow = { kind: 'routine', botId: r.botId, folder: clean(r.bot), routine: r.name, title: clean(r.name), line: clean(why ? `${head} — ${why}` : head), at: r.last?.start ?? 0 }
    const key = `${r.botId}\u0000${r.name}`
    const prev = latest.get(key)
    if (!prev || row.at > prev.at) latest.set(key, row)
  }
  const routine = [...latest.values()]
  routine.sort((a, b) => b.at - a.at)

  // 기간 합계 — 작업에 만든 때가 없어 «첫 카드가 시작된 때» 로 대신한다
  const tally = { done: 0, stalled: 0, added: 0 }
  for (const f of i.folders) {
    const byId = new Map(f.cards.map((c) => [c.id, c]))
    for (const t of f.tasks.tasks) {
      if (t.lastAt >= since) {
        if (t.state === 'done') tally.done++
        else if (t.state === 'stalled' || t.state === 'claimed') tally.stalled++
      }
      const starts = t.cards.map((id) => byId.get(id)?.from).filter((n): n is number => typeof n === 'number')
      if (starts.length && Math.min(...starts) >= since) tally.added++
    }
  }

  return scrub({
    v: 1, at: now, host: i.host, period: i.period, since,
    axis: i.axis ? { text: clean(i.axis.text), at: i.axis.at } : null,
    tally,
    step: { stalled: group(stalled), waiting: group(waiting), routine: group(routine) },
    goals, quiet,
    sources: i.sources.map((s) => ({ name: clean(s.name), ok: s.ok, at: s.at, ...(s.note === undefined ? {} : { note: clean(s.note) }) }))
  })
}

/** 마지막 걸음 — 필드마다 놓친 곳이 없도록 판의 모든 글에서 `%` 를 지운다(id·이름·마감·host 포함) */
function scrub<T>(v: T): T {
  if (typeof v === 'string') return v.replace(/%/g, '퍼센트') as T
  if (Array.isArray(v)) return v.map(scrub) as T
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) as T
  return v
}

// ── 이야기 ────────────────────────────────────────────────────────────────────

/** 시간 순 한 줄씩. 같은 세션이 이어진 카드는 한 줄로 합친다. outbox 줄은 작업을 고르지 않았을 때만 섞는다 */
export function story(f: FolderInput, taskId: string | null): StoryRow[] {
  let cards = f.cards
  if (taskId !== null) {
    const t = f.tasks.tasks.find((x) => x.id === taskId)
    const ids = new Set(t?.cards ?? [])
    cards = f.cards.filter((c) => ids.has(c.id))
  }
  cards = [...cards].sort((a, b) => a.from - b.from)
  const rows: StoryRow[] = []
  let cur: { sid: string; row: StoryRow } | null = null
  for (const c of cards) {
    const kind = c.done.flatMap((d) => d.ev)[0]?.kind
    if (cur && cur.sid === c.sessionId) {
      if (c.ending === 'cut') cur.row.stalled = true
      if (!cur.row.ev && kind) cur.row.ev = kind
      continue
    }
    const row: StoryRow = { at: c.from, channel: c.channel, machine: c.machine, text: clean(c.intent), stalled: c.ending === 'cut', ref: { sessionId: c.sessionId } }
    if (kind) row.ev = kind
    rows.push(row)
    cur = { sid: c.sessionId, row }
  }
  if (taskId === null) {
    for (const o of f.outbox) rows.push({ at: o.at, channel: 'file', machine: '', text: clean(o.text), stalled: false, ref: { file: 'state.md' } })
  }
  return rows.sort((a, b) => a.at - b.at)
}

/**
 * «그 세션 이어서» 가 갈 곳 — 마지막 세션 줄의 세션과 **그 세션의 주인 봇**(최종 검토 2).
 * 주인을 모르면(지운 세션·다른 맥 세션) 이어 쓰지 않는다 — 엉뚱한 봇의 세션에 그 폴더 봇 신분으로 말이 들어가면 안 된다.
 */
export function continueTarget(rows: StoryRow[]): { bot: string; sessionId: string } | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i].ref
    if ('sessionId' in r) return r.ownerBot ? { bot: r.ownerBot, sessionId: r.sessionId } : null
  }
  return null
}

// ── 함께 가는 맥락 ────────────────────────────────────────────────────────────

function cut(s: string, max: number): string {
  if (s.length <= max) return s
  const head = s.slice(0, max - 1)
  const nl = head.lastIndexOf('\n')
  return (nl > 0 ? head.slice(0, nl) : head).trimEnd() + '…'
}

/** 새 세션에 함께 보내는 «함께 가는 맥락» 블록 — 목표 · 작업 요약 · 빠진 것 · 근거 파일. 2,000자 안 */
export function brief(f: FolderInput, taskId: string | null): string {
  const lines = ['## 함께 가는 맥락', `목표: ${f.goal.text}${f.due ? ` (마감 ${f.due})` : ''}`]
  if (f.tasks.gap) lines.push(`간격: ${f.tasks.gap}`)
  const byId = new Map(f.cards.map((c) => [c.id, c]))
  const picked = taskId === null ? f.tasks.tasks : f.tasks.tasks.filter((t) => t.id === taskId)
  const rank = (t: CtxTask): number => (t.state === 'done' ? 1 : 0)
  for (const t of [...picked].sort((a, b) => rank(a) - rank(b) || b.lastAt - a.lastAt)) {
    lines.push(`- ${t.title} · ${STATE_KO[t.state]}${t.summary ? ` · ${t.summary}` : ''}`)
    if (t.missing) lines.push(`  빠진 것: ${t.missing}`)
    const files = [...new Set(t.cards.flatMap((id) => (byId.get(id)?.done ?? []).flatMap((d) => d.ev).filter((e) => e.kind === 'file').map((e) => e.ref)))]
    if (files.length) lines.push(`  근거: ${files.slice(0, 5).join(', ')}`)
  }
  return cut(clean(lines.join('\n')), BRIEF_MAX)
}

// ── board.md ─────────────────────────────────────────────────────────────────

const two = (n: number): string => String(n).padStart(2, '0')
function stamp(ms: number): string {
  const d = new Date(ms)
  return `${d.getMonth() + 1}/${d.getDate()} ${two(d.getHours())}:${two(d.getMinutes())}`
}

function stepBlock(title: string, g: StepGroup): string[] {
  const out = [`### ${title}`]
  if (!g.rows.length) { out.push('없음'); return out }
  for (const r of g.rows) out.push(`- ${r.title} (${r.folder}) — ${r.line}`)
  if (g.more > 0) out.push(`- 외 ${g.more}`)
  return out
}

export function renderBoardMd(b: Board): string {
  const L: string[] = ['# 맥락 상황판', '', `${b.host} · ${PERIOD_KO[b.period]} · ${stamp(b.at)} 정리`]
  const t = b.tally
  L.push(`이 기간: 끝남 ${t.done} · 하다 만 일 ${t.stalled} · 새로 생김 ${t.added}`)
  if (b.axis) L.push('', `오늘의 축: ${b.axis.text}`)
  for (const s of b.sources) if (!s.ok) L.push('', `⚠ ${s.name}: ${s.note ?? '못 읽음'}`)
  L.push('', '## 내가 나설 곳', '')
  L.push(...stepBlock('하다 만 일', b.step.stalled), '')
  L.push(...stepBlock('내 답 대기', b.step.waiting), '')
  L.push(...stepBlock('어긋난 루틴', b.step.routine), '')
  L.push('## 목표', '')
  if (!b.goals.length) L.push('없음', '')
  for (const g of b.goals) {
    L.push(`### ${g.folder}`, `- 목표: ${g.goal} · 마감: ${g.due}`)
    const counts = TASK_STATES.filter((s) => g.counts[s] > 0).map((s) => `${STATE_KO[s]} ${g.counts[s]}`)
    if (counts.length) L.push(`- 작업: ${counts.join(' · ')}`)
    if (g.gap) L.push(`- 간격: ${g.gap}`)
    if (g.just) L.push(`- 방금 끝난 것: ${g.just}`)
    if (g.next) L.push(`- 다음: ${g.next}`)
    for (const k of g.tasks) L.push(`  - [${STATE_KO[k.state]}] ${k.title}`)
    L.push('')
  }
  if (b.quiet.length) L.push(`조용한 목표 ${b.quiet.length}: ${b.quiet.join(', ')}`, '')
  return L.join('\n')
}

// ── 오늘의 축 ────────────────────────────────────────────────────────────────

/** 나설 곳과 목표를 보여 주고 «오늘의 축» 한 문장을 받는 프롬프트. 스텁이 `AXIS_MARK` 로 갈래를 고른다 */
export function axisPrompt(b: Board): string {
  const rows = [...b.step.stalled.rows, ...b.step.waiting.rows, ...b.step.routine.rows]
  const L = [
    AXIS_MARK,
    '아래는 Dave 의 맥락 상황판이다. 지금 가장 중요한 흐름 하나를 «오늘의 축» 한 문장(60자 안)으로 써라.',
    '숫자를 나열하지 말고 왜 지금 이것인지가 보이게 쓴다. 문장만 답하고 다른 말은 붙이지 않는다.',
    '',
    '[나설 곳]'
  ]
  if (!rows.length) L.push('없음')
  for (const r of rows) L.push(`- (${r.folder}) ${r.title}: ${r.line}`)
  L.push('', '[목표]')
  if (!b.goals.length) L.push('없음')
  for (const g of b.goals) L.push(`- ${g.folder}: ${g.goal} (마감 ${g.due}${g.problem ? ' · 걸린 일 있음' : ''})`)
  return clean(L.join('\n'))
}
