import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useEsc } from './esc'
import { api } from './api'
import { useStore } from './store'
import { Icon } from './FolderBot'
import { askName } from './Sheets'
import { STEP_ROWS, continueTarget, type Board, type GoalCard, type Period, type StepGroup, type StepRow, type StoryRow } from '../core/contextBoard'
import type { PermissionRequest } from '../core/types'
import { waitingOrder } from '../core/sessionTabs'
import type { CtxTask, TaskState } from '../core/contextTasks'
import type { SessionCard } from '../core/contextCard'
import { LinksView } from './Links'

/**
 * 🔴 맥락 상황판 — 화면 (2026-11-01 · «맥락 상황판» 1단계 Task 8).
 *    설계 `2. Area/제품_FolderBot/01_기획/2026-11-01_기획_맥락-상황판.md` §4·§8 · 목업 `03_디자인/2026-11-01_맥락-상황판-목업/` ①②.
 *  - `WaitBand` — 왼쪽 목록 맨 위의 «내 답을 기다림» 띠(맥 레일 `compact` · 폰 홈). 있을 때만 선다.
 *  - `ContextLine` — 봇 목록 아래 «상황판 · 하다 만 일 N · 어긋난 루틴 N ›» 한 줄. 누르면 상황판.
 *    (2026-11-14 왼쪽 목록 A안 — 종전의 홈 맨 위 띠 `ContextStrip` 을 이 둘로 갈랐다)
 *  - `ContextPage` — 기간 셋 · 큰 띠 · 목표 카드 · 조용한 목표 · 목표 펼치기(작업 · 이야기 · 채팅).
 * ⚠ 값은 모두 `/api/context/*` 가 준다 — 화면은 계산하지 않는다. 숫자는 «외 N» · 칩 수 · tally 만 쓴다(퍼센트 없음).
 * ⚠ 주인이 아닌 맥은 볼트 `board.json` 을 그대로 받는다 — 기간을 골라도 판의 `period` 가 다르면 그 사실을 적는다.
 */
type Status = { owner: boolean; paused: null | 'usage' | 'cap' | 'off'; calls: number; pending: number }
type GoalResp = { goal: GoalCard | null; tasks: CtxTask[]; loose: (SessionCard & { ownerBot?: string })[]; story: StoryRow[]; brief: string }
type Go = (b: string, sid?: string) => void
type Open = (goal?: { bot: string; task?: string }) => void

const STATES: TaskState[] = ['done', 'claimed', 'running', 'stalled', 'waiting', 'todo']
const STATE_KO: Record<TaskState, string> = { done: '끝남', claimed: '끝났다고 함', running: '하는 중', stalled: '하다 멈춤', waiting: '내 답 대기', todo: '아직' }
const PERIOD_KO: Record<Period, string> = { today: '오늘', week: '이번 주', away: '내가 비운 사이' }
const CH_KO: Record<StoryRow['channel'], string> = { folder: '폴더 봇', orch: '오케스트레이터', comm: '소통', bridge: '연결 편지', routine: '루틴', file: '파일 변화' }
const EV_KO = { file: '파일 근거', commit: '커밋 근거', letter: '편지 근거', tool: '도구 기록 근거' } as const
/** 🔴 2026-11-02 Dave «목업대로» — 내 답이 필요한 것 먼저, 그다음 하다 만 일 · 어긋난 루틴 */
const GROUPS: { k: keyof Board['step']; t: string }[] = [{ k: 'waiting', t: '내 답을 기다림' }, { k: 'stalled', t: '하다 만 일' }, { k: 'routine', t: '어긋난 루틴' }]
/** 범례 — 뜻을 가진 색은 둘(초록 끝남 · 앰버 내 차례). 하다 멈춤과 내 답 대기는 같은 «내 차례» 색이라 범례에서 한 칸이다 */
const LEGEND: { k: string; t: string }[] = [{ k: 'done', t: '끝남' }, { k: 'claimed', t: '끝났다고 함' }, { k: 'running', t: '하는 중' }, { k: 'waiting', t: '내 차례' }, { k: 'todo', t: '아직' }]
const p2 = (n: number) => String(n).padStart(2, '0')
const hm = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
const when = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? hm(t) : `${new Date(t).getMonth() + 1}/${new Date(t).getDate()} ${hm(t)}`)
const dueKo = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d); return m ? `${+m[1]}/${+m[2]} 마감` : d }
/** 카드의 마감 글자 — 이틀 안(지난 것 포함)이면 «soon» 으로 앰버. 오늘·내일은 말로 쓴다 */
const dueTag = (d: string): { t: string; soon: boolean } => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d); if (!m) return { t: d, soon: false }
  const now = new Date(); const days = Math.round((new Date(+m[1], +m[2] - 1, +m[3]).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  return { t: days === 0 ? '오늘 마감' : days === 1 ? '내일 마감' : days < 0 ? `${+m[2]}/${+m[3]} 지남` : `${+m[2]}/${+m[3]} 마감`, soon: days <= 2 }
}
const sidOf = (cardId: string) => cardId.split('#')[0]
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** 판 파일이 아직 없는 맥(주인 아님) — 빈 판을 «잘 도는 중» 으로 보이면 안 된다. 주인 여부를 못 읽어도 이 표지로 판정한다 */
const noFile = (b: Board) => b.sources.some((x) => x.name === '주인 맥 판' && !x.ok)

/** 세션 상태가 바뀌면(SSE `state`) 다시 읽게 하는 표지 — 상태 글자만 모아 비교한다 */
function useStateSig(): string {
  const { s } = useStore()
  return useMemo(() => Object.values(s.sessionsByBot).flat().map((x) => `${x.id}:${x.state}`).sort().join('|'), [s.sessionsByBot])
}

/**
 * 🔴 «내 답을 기다림» 은 **이 맥의 세션**으로 짓는다 (Ruling 21) — 주인 맥 `compose()` 와 같은 원천(`awaiting_input`).
 *    주인이 아닌 맥은 볼트 `board.json`(주인 맥의 세션 id)을 받으므로, 그 줄을 쓰면 [답하기] 가 없는 세션으로 간다.
 *    판을 못 읽어도(옛 호스트·판 파일 없음·오류) 이 덩이는 선다 — 확인 대기가 화면에서 사라지면 안 된다.
 */
type WRow = StepRow & { req?: PermissionRequest }
function useLocalWaiting(): { rows: WRow[]; more: number } {
  const { s } = useStore()
  return useMemo(() => {
    const names = new Map(s.bots.map((b) => [b.id, b.orchestrator ? '볼트 운영' : b.displayName || b.name] as const))
    // EC · 목록은 `core/sessionTabs.waitingOrder` 하나가 짓는다 — ⌘J(다음 기다리는 세션)와 세션 창의 «내 답 기다림» 탭이 같은 것을 쓴다
    const rows: WRow[] = waitingOrder(Object.values(s.sessionsByBot).flat(), (id) => names.has(id))
      .map((x) => {
        const req = (s.pending[x.id] ?? x.pending ?? [])[0]
        const line = req ? (req.ask ? '질문에 답해 주세요' : `허용을 기다려요 — ${req.displayName}`) : '내 답을 기다리는 중'
        return { kind: 'waiting', botId: x.botId, folder: names.get(x.botId)!, sessionId: x.id, title: x.name, line, at: x.lastActivity, req }
      })
    return { rows: rows.slice(0, STEP_ROWS), more: Math.max(0, rows.length - STEP_ROWS) }
  }, [s.sessionsByBot, s.pending, s.bots])
}

/** 띠의 [허용] — 종전 알림 칸의 [허용] 과 같은 문(같은 requestId · `/sessions/:id/permission` allow) */
function useAllow(say: (m: string) => void): { allow: (r: WRow) => void; busy: string } {
  const [busy, setBusy] = useState('')
  const allow = (r: WRow) => {
    if (!r.req || !r.sessionId || busy) return
    setBusy(r.sessionId)
    void api(`/sessions/${r.sessionId}/permission`, { body: { requestId: r.req.requestId, allow: true } })
      .then(() => say('허용했어요'), (e) => say(errMsg(e))).finally(() => setBusy(''))
  }
  return { allow, busy }
}

/* ── 띠 ──────────────────────────────────────────────────────────────────── */

type Acts = { go: Go; open: Open; openRoutines?: () => void; snooze: (r: StepRow) => void; allow: (r: WRow) => void; busy: string }
/**
 * 나설 곳 한 줄 — 점 · 폴더 · 무엇 · 시각 · 단추. 홈 띠(mini)는 «점 · 폴더 · 작업» 한 줄에 단추만, 상황판 페이지는 다섯 칸 격자.
 * 🔴 앰버 점은 «내 답을 기다림» 만 — 나머지 줄은 회색 점(2026-11-02 Dave «두 색 + 회색»).
 */
function StepItem({ r, a, mini }: { r: WRow; a: Acts; mini?: boolean }) {
  // 질문(AskUserQuestion)은 «허용» 할 것이 아니라 **답할** 것이다 (2026-09-25) — [허용] 은 도구 허용 요청에만
  const perm = r.kind === 'waiting' && r.req && !r.req.ask
  const what = r.kind === 'routine' ? `${r.title} — ${r.line}` : r.line
  return <div className={`cx-it k-${r.kind}`} data-kind={r.kind} data-sid={r.sessionId} title={r.kind === 'routine' ? what : `${r.title} — ${r.line}`}>
    <i className="cx-d" />
    <div className="cx-f"><span className="fo">{r.folder}</span>{r.kind === 'routine' ? null : <small> · {r.title}</small>}</div>
    <div className="cx-w">{r.kind === 'routine' ? what : <><span className="ti">{r.title}</span> — {r.line}</>}</div>
    {r.at ? <span className="cx-tm">{when(r.at)}</span> : <span className="cx-tm" />}
    <div className="cx-a">
      {r.kind === 'stalled' ? <><button className="btn cx-pri cx-cont" onClick={() => a.open({ bot: r.botId, task: r.taskId })}>{mini ? '이어서' : '이어서 하기'}</button>{mini ? null : <button className="btn ghost" onClick={() => a.snooze(r)}>놔둬</button>}</> : null}
      {perm ? <button className="btn cx-pri cx-allow" disabled={a.busy === r.sessionId} onClick={() => a.allow(r)}>{a.busy === r.sessionId ? '…' : '허용'}</button> : null}
      {r.kind === 'waiting' ? <button className={`btn ${perm ? 'ghost' : 'cx-pri'} cx-reply`} onClick={() => a.go(r.botId, r.sessionId)}>답하기</button> : null}
      {r.kind === 'routine' && a.openRoutines ? <button className="btn cx-pri" onClick={a.openRoutines}>점검하기</button> : null}
    </div>
  </div>
}

type Grp = { k: keyof Board['step']; t: string; v: StepGroup }
/** 띠가 보여 줄 덩이 — 판이 없거나(옛 호스트·오류) 판 파일이 없어도 «내 답을 기다림» 은 선다 */
function groupsOf(b: Board | null, waiting: StepGroup): { board: Board | null; groups: Grp[] } {
  const board = b && !noFile(b) ? b : null
  return { board, groups: GROUPS.map((g) => ({ ...g, v: g.k === 'waiting' ? waiting : board ? board.step[g.k] : { rows: [], more: 0 } })).filter((g) => g.v.rows.length) }
}

/** 띠 본체 — 상황판 페이지의 큰 띠. 상자는 한 겹 — 덩이는 제목 + 가는 줄로만 나눈다 */
function StripView({ b, waiting, a }: { b: Board | null; waiting: StepGroup; a: Acts }) {
  const { board, groups } = groupsOf(b, waiting)
  const total = board ? board.goals.length + board.quiet.length : 0
  const calm = board ? <div className="cx-calm"><i />{total ? `목표 ${total}개 모두 잘 도는 중` : '아직 정리된 목표가 없어요'}</div> : null
  const none = b && noFile(b) ? <div className="cx-calm none">아직 주인 맥 판 없음<span>주인 맥이 판을 한 번 쓰면 여기에 보여요</span></div> : null
  const rows = groups.flatMap((g) => g.v.rows)
  const more = groups.reduce((n, g) => n + g.v.more, 0)
  return <div className="cx-strip big">
    {board ? <div className="cx-hero">{board.axis ? <b>{board.axis.text}</b> : null}<span className="s"><span><em>끝남</em> {board.tally.done}</span><span><em>하다 만</em> {board.tally.stalled}</span><span><em>새로 생김</em> {board.tally.added}</span></span></div> : null}
    {none}
    {rows.length ? <section className="cx-need">
      <div className="cx-st"><b>지금 나설 곳</b><span className="m">내 답이 필요한 것 먼저 · 그다음 하다 만 일</span></div>
      <div className="cx-list">{rows.map((r, i) => <StepItem key={`${r.kind}:${r.botId}:${r.taskId ?? r.sessionId ?? r.routine ?? i}`} r={r} a={a} />)}</div>
      {more ? <span className="cx-more">외 {more} — 아래 목표 카드에 있어요</span> : null}
    </section> : calm}
  </div>
}

/**
 * «내 답을 기다림» 띠 — 왼쪽 목록 맨 위(찾기 · 폴더 선택 바로 아래), 기다리는 세션이 있을 때만 선다.
 *
 * 🔴 **왼쪽 목록 A안** (2026-11-12 Dave 카드 «A안» · 11/13 «이대로 만든다»): 봇 목록이 가장 큰 자리를 쓰고, 그 위에는
 *    «지금 내가 답해야 하는 것» 만 남긴다. 종전의 상황판 띠(11/1 «홈 맨 위» · 11/2 접고 펴기)는 세 덩이 — 내 답을 기다림 ·
 *    하다 만 일 · 어긋난 루틴 — 을 다 세워서, 답 대기가 둘이면 900px 창에서 봇이 다섯 줄 중 두 줄만 보였다(11/12 리뷰).
 *    하다 만 일과 어긋난 루틴은 목록 아래 «상황판» 한 줄(`ContextLine`)의 숫자로 내려갔고, 누르면 상황판이 열린다.
 * 🔴 판을 못 읽어도(옛 호스트 · 판 파일 없음 · 오류) 이 띠는 선다 — 확인 대기가 화면에서 사라지면 안 된다(이 맥의 세션 목록에서 짓는다).
 * ⚠ 최대 세 줄(`STEP_ROWS`). 넘으면 «외 N — 상황판에서». 줄의 [허용] · [답하기] 는 종전과 같은 문이다.
 */
export function WaitBand({ go, open, compact }: { go: Go; open: Open; compact?: boolean }) {
  const waiting = useLocalWaiting()
  const [note, setNote] = useState('')
  const { allow, busy } = useAllow(setNote)
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(''), 4000); return () => window.clearTimeout(t) }, [note])
  if (!waiting.rows.length) return null
  const a: Acts = { go, open, snooze: () => { /* 이 띠에는 «하다 만 일» 줄이 없다 */ }, allow, busy }
  return <div className={`cx-strip wband ${compact ? 'mini' : ''}`} role="group" aria-label="내 답을 기다림">
    <div className="cx-grp k-waiting">
      <div className="cx-gl">내 답을 기다림<span className="c">{waiting.rows.length + waiting.more}</span>{note ? <span className="cx-note">{note}</span> : null}</div>
      {waiting.rows.map((r, i) => <StepItem key={`${r.botId}:${r.sessionId ?? i}`} r={r} a={a} mini />)}
      {waiting.more ? <button className="cx-more" onClick={() => open()}>외 {waiting.more} — 상황판에서</button> : null}
    </div>
  </div>
}

/**
 * 상황판 한 줄 — 봇 목록 아래. «상황판 · 하다 만 일 4 · 어긋난 루틴 1 ›» 을 누르면 상황판이 열린다(왼쪽 목록 A안 · 2026-11-12).
 * 60초마다, 그리고 세션 상태가 바뀌면 다시 읽는다. 판을 못 읽어도(옛 호스트 · 오류) 줄은 선다 — 숫자 없이 «상황판 ›» 만.
 * ⚠ 숫자는 회색 글자다 — 압박 숫자를 색 배지로 세우지 않는다(11/2). «내 답을 기다림» 은 위 띠가 말하므로 여기서 또 세지 않는다.
 */
export function ContextLine({ open }: { open: Open }) {
  const [b, setB] = useState<Board | null>(null)
  const load = () => { void api<Board>('/context/board?period=today').then(setB).catch(() => setB(null)) }
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t) }, [])
  const sig = useStateSig(); const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } const t = window.setTimeout(load, 1500); return () => window.clearTimeout(t) }, [sig])
  const board = b && !noFile(b) ? b : null
  const n = (k: 'stalled' | 'routine') => (board ? board.step[k].rows.length + board.step[k].more : 0)
  const parts = [n('stalled') ? `하다 만 일 ${n('stalled')}` : '', n('routine') ? `어긋난 루틴 ${n('routine')}` : ''].filter(Boolean)
  const total = board ? board.goals.length + board.quiet.length : 0
  // 판을 못 읽어도(옛 호스트 · 오류) 줄은 선다 — 숫자 없이 «상황판 ›» 만. 상황판 창을 여는 길이 사라지면 안 된다
  const text = !b ? '' : !board ? '아직 주인 맥 판 없음' : parts.length ? parts.join(' · ') : total ? `목표 ${total}개 모두 잘 도는 중` : '아직 정리된 목표가 없어요'
  return <button className={`cx-line ${parts.length ? '' : 'calm'}`} onClick={() => open()} aria-label="상황판 열기" title="상황판 열기">
    <b>상황판</b><span className="s">{text}</span><Icon n="chev" size={10} color="var(--t3)" />
  </button>
}

/* ── 상황판 페이지 ───────────────────────────────────────────────────────── */

function Bar({ counts }: { counts: Record<TaskState, number> }) {
  return <div className="cx-bar">{STATES.filter((s) => counts[s] > 0).map((s) => <i key={s} className={`st-${s}`} style={{ flexGrow: counts[s] }} title={STATE_KO[s]} />)}</div>
}

function GoalTile({ g, onOpen }: { g: GoalCard; onOpen: () => void }) {
  const due = dueTag(g.due)
  // 🔴 테두리 색은 없다. 이름 앞 앰버 점은 «내 답을 기다리는 작업» 이 있을 때만(2026-11-02 Dave — 실제 판에서 문제 있는 목표가 거의 전부라 점이 구별을 못 했다).
  // 하다 만 일은 진행 막대에만 보인다. 본문은 «목표 대비 남은 것» 이 있으면 그것, 없으면 목표
  const ask = (g.counts.waiting ?? 0) > 0
  return <button className={`cx-gc ${g.problem ? 'bad' : ''}`} onClick={onOpen} title={g.goal}>
    <span className="top">{ask ? <i className="cx-d" title="내 답을 기다리는 일이 있어요" /> : null}<b className="nm">{g.folder}</b><span className={`dd ${due.soon ? 'soon' : ''}`}>{due.t}</span></span>
    <span className="goal">{g.gap || g.goal}</span>
    <Bar counts={g.counts} />
    {g.just ? <span className="ln"><span className="k">방금</span>{g.just}</span> : null}
    {g.next ? <span className="ln"><span className="k">다음</span>{g.next}</span> : null}
    <span className="chips">{g.chips.sessions ? <span>세션 {g.chips.sessions}</span> : null}{g.chips.routines ? <span>루틴 {g.chips.routines}</span> : null}</span>
  </button>
}

export function ContextPage({ onClose, go, goTodo, openRoutines, at, phone, openDoc }: {
  onClose(): void; go: Go; goTodo: (botId: string) => void; openRoutines(): void; at?: { bot: string; task?: string }; phone: boolean
  /** 이야기의 파일 근거 — 그 봇의 문서 창으로 연다 */
  openDoc?: (botId: string, rel: string) => void
}) {
  const { s } = useStore()
  const [period, setPeriod] = useState<Period>('today')
  const [boards, setBoards] = useState<Partial<Record<Period, Board>>>({})
  const [prev, setPrev] = useState<number | null | undefined>(undefined)
  const [st, setSt] = useState<Status | null>(null)
  const [goal, setGoal] = useState<{ bot: string; task?: string } | null>(at ?? null)
  const [note, setNote] = useState('')
  /** LM · «목표 | 연결» — 연결 지도는 상황판의 두 번째 보기(11/3 Dave) · 마지막에 고른 쪽을 기억한다 */
  const [tab, setTab] = useState<'goal' | 'link'>(() => { try { return localStorage.getItem('fb.cx.tab') === 'link' ? 'link' : 'goal' } catch { return 'goal' } })
  useEffect(() => { try { localStorage.setItem('fb.cx.tab', tab) } catch { /* */ } }, [tab])
  const load = (p: Period) => {
    if (p === 'away') return   // «내가 비운 사이» 는 연 순간 한 번만 — seen 뒤에 다시 읽으면 빈 판이다
    void api<Board>(`/context/board?period=${p}`).then((b) => setBoards((x) => ({ ...x, [p]: b }))).catch((e) => setNote(errMsg(e)))
  }
  useEffect(() => {
    // 🔴 순서: away 판을 **먼저** 읽고 seen 을 부른다 — 거꾸로 하면 «비운 사이» 가 빈 판이 된다
    void (async () => {
      try { const away = await api<Board>('/context/board?period=away'); setBoards((x) => ({ ...x, away })) } catch { /* 아래 판은 그대로 */ }
      try { const r = await api<{ prev: number | null }>('/context/seen', { body: {} }); setPrev(r.prev) } catch { setPrev(null) }
    })()
    void api<Status>('/context/status').then(setSt).catch(() => {})
  }, [])
  useEffect(() => { load(period); if (period === 'away') return; const t = window.setInterval(() => load(period), 60_000); return () => window.clearInterval(t) }, [period])
  const sig = useStateSig(); const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } const t = window.setTimeout(() => load(period), 1500); return () => window.clearTimeout(t) }, [sig])
  useEsc(() => { if (goal) setGoal(null); else onClose() })
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(''), 5000); return () => window.clearTimeout(t) }, [note])

  const b = boards[period]
  const owner = st ? st.owner : null
  const waiting = useLocalWaiting()
  const { allow, busy } = useAllow(setNote)
  const snooze = async (r: StepRow) => { try { await api('/context/snooze', { body: { bot: r.botId, task: r.taskId } }); setNote('7일 동안 나설 곳에서 뺐어요'); load(period) } catch (e) { setNote(errMsg(e)) } }
  const open: Open = (g) => { if (g) setGoal(g) }
  const botOfName = (name: string) => s.bots.find((x) => (x.displayName || x.name) === name || x.name === name)
  const awaySub = prev === undefined ? '' : prev ? `${when(prev)} 이후` : '처음 열었어요 · 지난 7일'
  const mismatch = b && b.period !== period ? `${b.host} 판은 ${PERIOD_KO[b.period]}만 있어요` : ''
  const missing = b ? b.sources.filter((x) => !x.ok && x.name !== '주인 맥 판') : []

  return <><div className="backdrop" onClick={onClose} /><div className={`modal board cx sz-l ${phone ? 'phone' : ''}`} aria-modal="true" role="dialog" aria-label="상황판">
    <div className="grip" />
    {goal ? <GoalView key={`${goal.bot}`} at={goal} back={() => setGoal(null)} onClose={onClose} go={go} goTodo={goTodo} phone={phone} openDoc={openDoc} owner={owner} />
      : <>
        <div className="modal-h"><div className="t"><b>상황판</b><span className="cnt">{b ? `${owner === false ? `${b.host} 판 · ` : ''}${hm(b.at)} 정리` : '불러오는 중…'}{note ? ` · ${note}` : ''}</span></div>
          <span className="seg cx-seg cx-tab">{([['goal', '목표'], ['link', '연결']] as const).map(([k, t]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t}</button>)}</span>
          {tab === 'goal' ? <span className="seg cx-seg">{(['today', 'week', 'away'] as Period[]).map((p) => <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)} title={p === 'away' ? awaySub : undefined}>{PERIOD_KO[p]}</button>)}</span> : null}
          <button className="btn sm cx-rt" onClick={openRoutines} title="루틴 관리"><Icon n="clock" size={12} />루틴</button>
          <button className="ib mx" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
        {tab === 'link' ? <div className="bbody cx-body lm-body"><LinksView phone={phone} go={go} openDoc={openDoc} say={setNote} /></div> : <div className="bbody cx-body">
          {period === 'away' && awaySub ? <div className="cx-sub">{awaySub}</div> : null}
          {mismatch ? <div className="cx-sub warn">{mismatch}</div> : null}
          {b ? <>
            <StripView b={b} waiting={waiting} a={{ go, open, openRoutines, snooze: (r) => void snooze(r), allow, busy }} />
            {b.goals.length ? <section className="cx-goals">
              <div className="cx-gh cx-st"><b>목표</b><span className="m">문제 있는 목표 먼저 · 그다음 마감 가까운 순</span>
                <span className="cx-leg">{LEGEND.map((x) => <span key={x.k}><i className={`st-${x.k}`} />{x.t}</span>)}</span></div>
              <div className="cx-grid">{b.goals.map((g) => <GoalTile key={g.botId} g={g} onOpen={() => setGoal({ bot: g.botId })} />)}</div>
            </section> : null}
            {b.quiet.length ? <details className="cx-quiet"><summary>조용한 목표 {b.quiet.length}</summary>
              <div className="l">{b.quiet.map((n) => { const bt = botOfName(n); return bt ? <button key={n} className="cx-chip" onClick={() => setGoal({ bot: bt.id })}>{n}</button> : <span key={n} className="cx-chip">{n}</span> })}</div>
            </details> : null}
            {missing.length ? <div className="cx-src">{missing.map((x) => <span key={x.name}>{x.name}: {x.note ?? '못 읽음'}</span>)}</div> : null}
          </> : <div className="bempty">{period === 'away' ? '비운 사이 판을 못 읽었어요' : '불러오는 중…'}</div>}
        </div>}
      </>}
  </div></>
}

/* ── 목표 펼치기 ─────────────────────────────────────────────────────────── */

type Sel = string | null | 'loose'   // 작업 id · 전체 이야기(null) · 안 묶인 세션
type Row = StoryRow & { cards: string[] }
const DRAG = 'application/x-fb-cards'

function GoalView({ at, back, onClose, go, goTodo, phone, openDoc, owner }: {
  at: { bot: string; task?: string }; back: () => void; onClose: () => void; go: Go; goTodo: (botId: string) => void; phone: boolean
  openDoc?: (botId: string, rel: string) => void; owner: boolean | null
}) {
  const bot = at.bot
  const [sel, setSel] = useState<Sel>(at.task ?? null)
  const [d, setD] = useState<GoalResp | null>(null)
  const [note, setNote] = useState('')
  const [menu, setMenu] = useState<number | null>(null)
  const [over, setOver] = useState('')
  // 요청 번호 — 작업을 빨리 바꿔 누르면 늦게 온 옛 답이 새 작업의 이야기를 덮는다. 마지막 요청의 답만 쓴다
  const reqN = useRef(0)
  const load = () => {
    const n = ++reqN.current
    void api<GoalResp>(`/context/goal?bot=${encodeURIComponent(bot)}${typeof sel === 'string' && sel !== 'loose' ? `&task=${encodeURIComponent(sel)}` : ''}`)
      .then((r) => { if (n === reqN.current) setD(r) }, (e) => { if (n === reqN.current) setNote(errMsg(e)) })
  }
  useEffect(() => { load(); return () => { reqN.current++ } }, [bot, sel])
  const task = d && sel && sel !== 'loose' ? d.tasks.find((t) => t.id === sel) ?? null : null
  const rows: Row[] = !d ? [] : sel === 'loose'
    ? d.loose.map((c) => ({ at: c.from, channel: c.channel, machine: c.machine, text: c.intent, stalled: c.ending === 'cut', ref: { sessionId: c.sessionId, ownerBot: c.ownerBot }, cards: [c.id] }))
    : d.story.map((r) => ({ ...r, cards: task && 'sessionId' in r.ref ? task.cards.filter((id) => sidOf(id) === (r.ref as { sessionId: string }).sessionId) : [] }))
  // «그 세션 이어서» 는 그 세션의 주인 봇으로 — 오케스트레이터 조각 카드면 오케스트레이터(최종 검토 2)
  const cont = continueTarget(rows)
  const g = d?.goal
  const name = g?.folder ?? bot

  const say = (m: string) => { setNote(m); window.setTimeout(() => setNote((x) => (x === m ? '' : x)), 5000) }
  /** 카드 묶음 옮기기 — 새 작업이면 첫 장으로 작업을 만들고, 호스트가 돌려준 그 작업 id 로 나머지를 옮긴다(이름으로 다시 찾지 않는다) */
  const move = async (cards: string[], to: string | { newTitle: string }) => {
    setMenu(null)
    let dest = to, done = 0
    try {
      for (const card of cards) {
        const r = await api<{ task?: string }>('/context/move', { body: { bot, card, ...(typeof dest === 'string' ? { to: dest } : { newTitle: dest.newTitle }) } })
        done++
        if (typeof dest !== 'string') { if (!r.task) break; dest = r.task }
      }
      say(done === cards.length ? '옮겼어요 — 이 배정은 AI 가 다시 묶어도 그대로예요' : `${cards.length}장 중 ${done}장만 옮겼어요 — 다시 해 주세요`)
    } catch (e) { say(done ? `${cards.length}장 중 ${done}장만 옮기고 멈췄어요 — ${errMsg(e)}` : errMsg(e)) }
    load()
  }
  const moveNew = async (cards: string[]) => { setMenu(null); const t = await askName('새 작업 이름'); if (t?.trim()) await move(cards, { newTitle: t.trim() }) }
  const reopen = async () => { if (!task) return; try { await api('/context/reopen', { body: { bot, task: task.id } }); say('다시 열었어요'); load() } catch (e) { say(errMsg(e)) } }
  const drop = (e: DragEvent, to: string) => { e.preventDefault(); setOver(''); try { const cards = JSON.parse(e.dataTransfer.getData(DRAG)) as string[]; if (cards.length) void move(cards, to) } catch { /* 다른 끌기 */ } }
  const dragOver = (e: DragEvent, id: string) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOver(id) } }
  const clickRow = (r: Row) => { if ('sessionId' in r.ref) go(r.ref.ownerBot ?? bot, r.ref.sessionId); else if (openDoc) openDoc(bot, r.ref.file) }
  const sessionsOf = (t: CtxTask) => new Set(t.cards.map(sidOf)).size

  return <>
    <div className="modal-h cx-gvh"><button className="ib" onClick={back} title="상황판으로" aria-label="상황판으로"><Icon n="back" size={14} /></button>
      <div className="t"><b>{name}</b><span className="cnt">{g ? `${g.goal} · ${dueKo(g.due)}` : '불러오는 중…'}{note ? ` · ${note}` : ''}</span></div>
      <button className="ib mx" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
    <div className={`cx-three ${phone ? 'phone' : ''}`}>
      <section className="cx-col cx-tasks">
        <div className="cx-ch"><b>작업</b><span className="m">{owner === false ? '고치기는 주인 맥에서' : 'AI 가 묶음 · 틀리면 끌어서 옮김'}</span></div>
        <button className={`cx-tk ${sel === null ? 'on' : ''}`} onClick={() => setSel(null)}><span className="st all" /><span><span className="nm">전체 이야기</span></span></button>
        {d?.tasks.map((t) => <button key={t.id} className={`cx-tk ${sel === t.id ? 'on' : ''} ${over === t.id ? 'over' : ''}`} data-task={t.id}
          onClick={() => (t.state === 'todo' ? goTodo(bot) : setSel(t.id))}
          onDragOver={(e) => dragOver(e, t.id)} onDragLeave={() => setOver('')} onDrop={(e) => drop(e, t.id)}>
          <span className={`st st-${t.state}`} /><span><span className="nm">{t.title}</span><span className="sb">{STATE_KO[t.state]}{t.cards.length ? ` · 세션 ${sessionsOf(t)}` : t.todoTitle ? ' · 할 일 목록에서 옴' : ''}</span></span>
        </button>)}
        {d?.loose.length ? <button className={`cx-tk loose ${sel === 'loose' ? 'on' : ''}`} onClick={() => setSel('loose')}><span className="st all" /><span><span className="nm">안 묶인 세션 {d.loose.length}</span></span></button> : null}
      </section>

      <section className="cx-col cx-story">
        <div className="cx-ch"><b>{sel === 'loose' ? '안 묶인 세션' : task ? task.title : '전체 이야기'}</b>{task ? <span className="m">{STATE_KO[task.state]}</span> : null}
          {task && (task.state === 'done' || task.state === 'claimed') ? <button className="btn ghost cx-re" onClick={() => void reopen()}>안 끝났어</button> : null}</div>
        {task ? <div className="cx-now"><p><b>지금 어디까지</b> — {task.summary || '아직 요약이 없어요'}</p><p><b>빠진 것</b> — {task.missing || '없음'}</p></div>
          : sel === null && g?.gap ? <div className="cx-now"><p><b>목표 대비</b> — {g.gap}</p></div> : null}
        {owner === false ? <div className="bempty">이야기는 주인 맥에서 보여요</div> : null}
        {rows.length ? rows.map((r, i) => <div key={i} className={`cx-ev ${r.stalled ? 'half' : ''}`} draggable={r.cards.length > 0}
          onDragStart={(e) => { e.dataTransfer.setData(DRAG, JSON.stringify(r.cards)); e.dataTransfer.effectAllowed = 'move' }}>
          <button className="cx-evb" onClick={() => clickRow(r)}>
            <span className="tm">{when(r.at)}</span><span className={`src c-${r.channel}`}>{CH_KO[r.channel]}</span>
            <span className="tx"><span className="l">{r.text}</span>{r.ev ? <span className="r">{EV_KO[r.ev]}</span> : 'file' in r.ref ? <span className="r">{r.ref.file}</span> : null}</span>
          </button>
          {r.cards.length ? <span className="cx-mw"><button className="ib" onClick={() => setMenu(menu === i ? null : i)} title="다른 작업으로 옮기기" aria-label="다른 작업으로 옮기기"><Icon n="more" size={14} /></button>
            {menu === i ? <div className="menu cx-menu"><div className="h">다른 작업으로 옮기기</div>
              {d?.tasks.filter((t) => t.id !== sel).map((t) => <button key={t.id} onClick={() => void move(r.cards, t.id)}><span className={`st st-${t.state}`} />{t.title}</button>)}
              <hr /><button onClick={() => void moveNew(r.cards)}><Icon n="plus" size={12} />새 작업…</button></div> : null}</span> : null}
        </div>) : owner === false ? null : <div className="bempty">{d ? '이 기간에 남은 이야기가 없어요' : '불러오는 중…'}</div>}
      </section>

      <ChatBox bot={bot} name={name} task={task} cont={sel === 'loose' ? null : cont} brief={d?.brief ?? ''} go={(b, sid) => { onClose(); go(b, sid) }} />
    </div>
  </>
}

/* ── 오른쪽 채팅 ─────────────────────────────────────────────────────────── */

type Target = 'cont' | 'new' | 'orch'
function ChatBox({ bot, name, task, cont, brief, go }: { bot: string; name: string; task: CtxTask | null; cont: { bot: string; sessionId: string } | null; brief: string; go: Go }) {
  const { s } = useStore()
  const lastSid = cont?.sessionId ?? null
  const [to, setTo] = useState<Target>(task && lastSid ? 'cont' : 'new')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 작업을 바꾸면 받는 쪽 기본값도 다시 — 작업이 있으면 그 세션 이어서, 목표 전체면 새 세션
  useEffect(() => { setTo(task && lastSid ? 'cont' : 'new') }, [task?.id, lastSid])
  const title = task?.title ?? name
  const contBot = cont ? s.bots.find((x) => x.id === cont.bot) : undefined
  const contName = !cont || cont.bot === bot ? `${name} 봇` : contBot?.orchestrator ? '오케스트레이터' : `${contBot?.displayName || contBot?.name || cont.bot} 봇`
  const sub = to === 'cont' ? `받는 쪽: ${contName} · 그 세션을 이어 씀` : to === 'new' ? `받는 쪽: ${name} 봇 · 새 세션 «상황판 · ${title}»` : '받는 쪽: 오케스트레이터 · 새 세션'
  const send = async () => {
    const msg = text.trim(); if (!msg || busy) return
    setBusy(true); setErr('')
    const full = brief ? `${brief}\n\n${msg}` : msg
    try {
      const target = to === 'orch' ? 'orch' : to === 'cont' && cont ? cont.bot : bot
      const body = to === 'cont' && cont ? { text: full, sessionId: cont.sessionId } : to === 'new' ? { text: full, name: `상황판 · ${title}` } : { text: full }
      const r = await api<{ sessionId: string }>(`/bots/${encodeURIComponent(target)}/send`, { body })
      setText(''); go(target, r.sessionId)
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  return <section className="cx-col cx-chat">
    <div className="cx-ch"><b>{task ? '이 작업에 말하기' : '이 목표에 말하기'}</b></div>
    <div className="cx-to" role="radiogroup" aria-label="받는 쪽">
      {([['cont', '그 세션 이어서'], ['new', '목표 요약 싣고 새 세션'], ['orch', '오케스트레이터']] as [Target, string][]).map(([k, l]) =>
        <button key={k} role="radio" aria-checked={to === k} className={to === k ? 'on' : ''} disabled={k === 'cont' && !lastSid} onClick={() => setTo(k)}>{l}</button>)}
    </div>
    <div className="cx-tosub">{sub}</div>
    {brief ? <details className="cx-brief"><summary>함께 가는 맥락 — 보낼 때 맨 앞에 붙어요</summary><pre>{brief}</pre></details> : null}
    <textarea className="cx-in" value={text} placeholder="이어서 말하기…" onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }} />
    {err ? <div className="cx-err">{err}</div> : null}
    <div className="cx-send"><span className="k">⌘↵</span><button className="btn primary" disabled={busy || !text.trim()} onClick={() => void send()}><Icon n="send" size={12} />{busy ? '보내는 중…' : '보내기'}</button></div>
  </section>
}
