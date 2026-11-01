import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { api } from './api'
import { useStore } from './store'
import { Icon } from './FolderBot'
import { askName } from './Sheets'
import type { Board, GoalCard, Period, StepGroup, StepRow, StoryRow } from '../core/contextBoard'
import type { CtxTask, TaskState } from '../core/contextTasks'
import type { SessionCard } from '../core/contextCard'

/**
 * 🔴 맥락 상황판 — 화면 (2026-11-01 · «맥락 상황판» 1단계 Task 8).
 *    설계 `2. Area/제품_FolderBot/01_기획/2026-11-01_기획_맥락-상황판.md` §4·§8 · 목업 `03_디자인/2026-11-01_맥락-상황판-목업/` ①②.
 *  - `ContextStrip` — 홈 맨 위 띠(맥 레일 `compact` · 폰 홈). 축 한 줄 → 나설 곳 세 덩이 → 누르면 상황판.
 *  - `ContextPage` — 기간 셋 · 큰 띠 · 목표 카드 · 조용한 목표 · 목표 펼치기(작업 · 이야기 · 채팅).
 * ⚠ 값은 모두 `/api/context/*` 가 준다 — 화면은 계산하지 않는다. 숫자는 «외 N» · 칩 수 · tally 만 쓴다(퍼센트 없음).
 * ⚠ 주인이 아닌 맥은 볼트 `board.json` 을 그대로 받는다 — 기간을 골라도 판의 `period` 가 다르면 그 사실을 적는다.
 */
type Status = { owner: boolean; paused: null | 'usage' | 'cap' | 'off'; calls: number; pending: number }
type GoalResp = { goal: GoalCard | null; tasks: CtxTask[]; loose: SessionCard[]; story: StoryRow[]; brief: string }
type Go = (b: string, sid?: string) => void
type Open = (goal?: { bot: string; task?: string }) => void

const STATES: TaskState[] = ['done', 'claimed', 'running', 'stalled', 'waiting', 'todo']
const STATE_KO: Record<TaskState, string> = { done: '끝남', claimed: '끝났다고 함', running: '하는 중', stalled: '하다 멈춤', waiting: '내 답 대기', todo: '아직' }
const PERIOD_KO: Record<Period, string> = { today: '오늘', week: '이번 주', away: '내가 비운 사이' }
const CH_KO: Record<StoryRow['channel'], string> = { folder: '폴더 봇', orch: '오케스트레이터', comm: '소통', bridge: '연결 편지', routine: '루틴', file: '파일 변화' }
const EV_KO = { file: '파일 근거', commit: '커밋 근거', letter: '편지 근거', tool: '도구 기록 근거' } as const
const GROUPS: { k: keyof Board['step']; t: string }[] = [{ k: 'stalled', t: '하다 만 일' }, { k: 'waiting', t: '내 답을 기다림' }, { k: 'routine', t: '어긋난 루틴' }]
const p2 = (n: number) => String(n).padStart(2, '0')
const hm = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
const when = (t: number) => (new Date(t).toDateString() === new Date().toDateString() ? hm(t) : `${new Date(t).getMonth() + 1}/${new Date(t).getDate()} ${hm(t)}`)
const dueKo = (d: string) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d); return m ? `${+m[1]}/${+m[2]} 마감` : d }
const sidOf = (cardId: string) => cardId.split('#')[0]
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
/** 판 파일이 아직 없는 주인 아닌 맥 — 빈 판을 «잘 도는 중» 으로 보이면 안 된다 */
const noFile = (b: Board) => b.sources.some((x) => x.name === '주인 맥 판' && !x.ok)

/** 세션 상태가 바뀌면(SSE `state`) 다시 읽게 하는 표지 — 상태 글자만 모아 비교한다 */
function useStateSig(): string {
  const { s } = useStore()
  return useMemo(() => Object.values(s.sessionsByBot).flat().map((x) => `${x.id}:${x.state}`).sort().join('|'), [s.sessionsByBot])
}

/* ── 띠 ──────────────────────────────────────────────────────────────────── */

function StepItem({ r, go, open, openRoutines, snooze }: { r: StepRow; go: Go; open: Open; openRoutines?: () => void; snooze: (r: StepRow) => void }) {
  return <div className="cx-it" data-kind={r.kind} title={r.kind === 'routine' ? `${r.title} — ${r.line}` : r.line}>
    <div className="cx-f">{r.folder}{r.kind === 'routine' ? '' : ` · ${r.title}`}</div>
    <div className="cx-w">{r.kind === 'routine' ? `${r.title} — ${r.line}` : r.line}</div>
    <div className="cx-a">
      {r.kind === 'stalled' ? <><button className="btn cx-pri" onClick={() => open({ bot: r.botId, task: r.taskId })}>이어서 하기</button><button className="btn ghost" onClick={() => snooze(r)}>놔둬</button></> : null}
      {r.kind === 'waiting' ? <button className="btn cx-pri" onClick={() => go(r.botId, r.sessionId)}>답하기</button> : null}
      {r.kind === 'routine' && openRoutines ? <button className="btn cx-pri" onClick={openRoutines}>점검하기</button> : null}
      {r.at ? <span className="cx-tm">{when(r.at)}</span> : null}
    </div>
  </div>
}

/** 띠 본체 — 홈 띠와 상황판 페이지가 같은 그림을 쓴다 */
function StripView({ b, owner, go, open, openRoutines, onSnooze, compact, big, head }: {
  b: Board; owner: boolean | null; go: Go; open: Open; openRoutines?: () => void; onSnooze: (r: StepRow) => void; compact?: boolean; big?: boolean; head?: ReactNode
}) {
  const stamp = owner === false ? `${b.host} 판 · ${hm(b.at)} 정리` : `${hm(b.at)} 정리`
  if (owner === false && noFile(b)) return <div className={`cx-strip ${compact ? 'mini' : ''} ${big ? 'big' : ''}`}>{head}<div className="cx-calm none">아직 주인 맥 판 없음<span>주인 맥이 판을 한 번 쓰면 여기에 보여요</span></div></div>
  const t = b.tally
  const groups = GROUPS.map((g) => ({ ...g, v: b.step[g.k] as StepGroup })).filter((g) => g.v.rows.length)
  const total = b.goals.length + b.quiet.length
  return <div className={`cx-strip ${compact ? 'mini' : ''} ${big ? 'big' : ''}`}>
    {head}
    <div className="cx-axis">{b.axis ? <b>{b.axis.text}</b> : null}<span className="s">끝남 {t.done} · 하다 만 {t.stalled} · 새로 생김 {t.added} · {stamp}</span></div>
    {groups.length ? <div className="cx-need">{groups.map((g) => <div key={g.k} className={`cx-nk k-${g.k}`}>
      <h3>{g.t}<span className="c">{g.v.rows.length + g.v.more}</span></h3>
      {g.v.rows.map((r, i) => <StepItem key={`${r.botId}:${r.taskId ?? r.sessionId ?? r.routine ?? i}`} r={r} go={go} open={open} openRoutines={openRoutines} snooze={onSnooze} />)}
      {g.v.more ? (big ? <span className="cx-more">외 {g.v.more} — 아래 목표 카드에 있어요</span> : <button className="cx-more" onClick={() => open()}>외 {g.v.more}</button>) : null}
    </div>)}</div>
      : <div className="cx-calm"><i />{total ? `목표 ${total}개 모두 잘 도는 중` : '아직 정리된 목표가 없어요'}</div>}
  </div>
}

/** 홈 맨 위 띠 — 60초마다, 그리고 세션 상태가 바뀌면 다시 읽는다. 상황판이 없는 호스트(옛 판)면 아무것도 안 그린다 */
export function ContextStrip({ go, open, compact, openRoutines }: { go: Go; open: Open; compact?: boolean; openRoutines?: () => void }) {
  const [b, setB] = useState<Board | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [note, setNote] = useState('')
  const load = () => { void api<Board>('/context/board?period=today').then(setB).catch(() => { /* 없으면 안 그린다 */ }); void api<Status>('/context/status').then(setSt).catch(() => {}) }
  useEffect(() => { load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t) }, [])
  const sig = useStateSig(); const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } const t = window.setTimeout(load, 1500); return () => window.clearTimeout(t) }, [sig])
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(''), 4000); return () => window.clearTimeout(t) }, [note])
  const snooze = async (r: StepRow) => { try { await api('/context/snooze', { body: { bot: r.botId, task: r.taskId } }); setNote('7일 동안 여기서 뺐어요'); load() } catch (e) { setNote(errMsg(e)) } }
  if (!b) return null
  const head = <button className="cx-h" onClick={() => open()} aria-label="상황판 열기"><b>상황판</b>{note ? <span className="cx-note">{note}</span> : null}<span className="sp" /><Icon n="chev" size={9} color="var(--t3)" /></button>
  return <StripView b={b} owner={st ? st.owner : null} go={go} open={open} openRoutines={openRoutines} onSnooze={(r) => void snooze(r)} compact={compact} head={head} />
}

/* ── 상황판 페이지 ───────────────────────────────────────────────────────── */

function Bar({ counts }: { counts: Record<TaskState, number> }) {
  return <div className="cx-bar">{STATES.filter((s) => counts[s] > 0).map((s) => <i key={s} className={`st-${s}`} style={{ flexGrow: counts[s] }} title={STATE_KO[s]} />)}</div>
}

function GoalTile({ g, onOpen }: { g: GoalCard; onOpen: () => void }) {
  return <button className={`cx-gc ${g.problem ? 'bad' : ''}`} onClick={onOpen}>
    <span className="top"><b className="nm">{g.folder}</b><span className="dd">{dueKo(g.due)}</span></span>
    <span className="goal">{g.goal}</span>
    {g.gap ? <span className="gap">{g.gap}</span> : null}
    <Bar counts={g.counts} />
    {g.just ? <span className="ln"><span className="k">방금</span>{g.just}</span> : null}
    {g.next ? <span className="ln"><span className="k">다음</span>{g.next}</span> : null}
    <span className="chips">{g.chips.sessions ? <span className="cx-chip">세션 {g.chips.sessions}</span> : null}{g.chips.routines ? <span className="cx-chip">루틴 {g.chips.routines}</span> : null}</span>
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
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.modal.ask')) { if (goal) setGoal(null); else onClose() } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [goal, onClose])
  useEffect(() => { if (!note) return; const t = window.setTimeout(() => setNote(''), 5000); return () => window.clearTimeout(t) }, [note])

  const b = boards[period]
  const owner = st ? st.owner : null
  const snooze = async (r: StepRow) => { try { await api('/context/snooze', { body: { bot: r.botId, task: r.taskId } }); setNote('7일 동안 나설 곳에서 뺐어요'); load(period) } catch (e) { setNote(errMsg(e)) } }
  const open: Open = (g) => { if (g) setGoal(g) }
  const botOfName = (name: string) => s.bots.find((x) => (x.displayName || x.name) === name || x.name === name)
  const awaySub = prev === undefined ? '' : prev ? `${when(prev)} 이후` : '처음 열었어요 · 지난 7일'
  const mismatch = b && b.period !== period ? `${b.host} 판은 ${PERIOD_KO[b.period]}만 있어요` : ''
  const missing = b ? b.sources.filter((x) => !x.ok && x.name !== '주인 맥 판') : []

  return <><div className="backdrop" onClick={onClose} /><div className={`modal board cx ${phone ? 'phone' : ''}`} role="dialog" aria-label="상황판">
    <div className="grip" />
    {goal ? <GoalView key={`${goal.bot}`} at={goal} back={() => setGoal(null)} onClose={onClose} go={go} goTodo={goTodo} phone={phone} openDoc={openDoc} owner={owner} />
      : <>
        <div className="modal-h"><div className="t"><b>상황판</b><span className="cnt">{b ? `${owner === false ? `${b.host} 판 · ` : ''}${hm(b.at)} 정리` : '불러오는 중…'}{note ? ` · ${note}` : ''}</span></div>
          <span className="seg cx-seg">{(['today', 'week', 'away'] as Period[]).map((p) => <button key={p} className={period === p ? 'on' : ''} onClick={() => setPeriod(p)} title={p === 'away' ? awaySub : undefined}>{PERIOD_KO[p]}</button>)}</span>
          <button className="ib" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
        <div className="bbody cx-body">
          {period === 'away' && awaySub ? <div className="cx-sub">{awaySub}</div> : null}
          {mismatch ? <div className="cx-sub warn">{mismatch}</div> : null}
          {b ? <>
            <StripView b={b} owner={owner} go={go} open={open} openRoutines={openRoutines} onSnooze={(r) => void snooze(r)} big />
            {b.goals.length ? <section className="cx-goals">
              <div className="cx-gh"><b>목표</b><span className="m">문제 있는 목표 먼저 · 그다음 마감 가까운 순</span>
                <span className="cx-leg">{STATES.map((x) => <span key={x}><i className={`st-${x}`} />{STATE_KO[x]}</span>)}</span></div>
              <div className="cx-grid">{b.goals.map((g) => <GoalTile key={g.botId} g={g} onOpen={() => setGoal({ bot: g.botId })} />)}</div>
            </section> : null}
            {b.quiet.length ? <details className="cx-quiet"><summary>조용한 목표 {b.quiet.length}</summary>
              <div className="l">{b.quiet.map((n) => { const bt = botOfName(n); return bt ? <button key={n} className="cx-chip" onClick={() => setGoal({ bot: bt.id })}>{n}</button> : <span key={n} className="cx-chip">{n}</span> })}</div>
            </details> : null}
            {missing.length ? <div className="cx-src">{missing.map((x) => <span key={x.name}>{x.name}: {x.note ?? '못 읽음'}</span>)}</div> : null}
          </> : <div className="bempty">{period === 'away' ? '비운 사이 판을 못 읽었어요' : '불러오는 중…'}</div>}
        </div>
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
  const load = () => { void api<GoalResp>(`/context/goal?bot=${encodeURIComponent(bot)}${typeof sel === 'string' && sel !== 'loose' ? `&task=${encodeURIComponent(sel)}` : ''}`).then(setD).catch((e) => setNote(errMsg(e))) }
  useEffect(load, [bot, sel])
  const task = d && sel && sel !== 'loose' ? d.tasks.find((t) => t.id === sel) ?? null : null
  const rows: Row[] = !d ? [] : sel === 'loose'
    ? d.loose.map((c) => ({ at: c.from, channel: c.channel, machine: c.machine, text: c.intent, stalled: c.ending === 'cut', ref: { sessionId: c.sessionId }, cards: [c.id] }))
    : d.story.map((r) => ({ ...r, cards: task && 'sessionId' in r.ref ? task.cards.filter((id) => sidOf(id) === (r.ref as { sessionId: string }).sessionId) : [] }))
  const lastSid = (() => { for (let i = rows.length - 1; i >= 0; i--) { const r = rows[i].ref; if ('sessionId' in r) return r.sessionId } return task?.cards.length ? sidOf(task.cards[task.cards.length - 1]) : null })()
  const g = d?.goal
  const name = g?.folder ?? bot

  const say = (m: string) => { setNote(m); window.setTimeout(() => setNote((x) => (x === m ? '' : x)), 5000) }
  /** 카드 묶음 옮기기 — 새 작업이면 첫 장으로 작업을 만들고 그 id 로 나머지를 옮긴다 */
  const move = async (cards: string[], to: string | { newTitle: string }) => {
    setMenu(null)
    try {
      let dest = to
      for (const card of cards) {
        await api('/context/move', { body: { bot, card, ...(typeof dest === 'string' ? { to: dest } : { newTitle: dest.newTitle }) } })
        if (typeof dest !== 'string') { const title = dest.newTitle; const r = await api<GoalResp>(`/context/goal?bot=${encodeURIComponent(bot)}`); const t = r.tasks.find((x) => x.title === title); if (!t) break; dest = t.id }
      }
      say('옮겼어요 — 이 배정은 AI 가 다시 묶어도 그대로예요'); load()
    } catch (e) { say(errMsg(e)) }
  }
  const moveNew = async (cards: string[]) => { setMenu(null); const t = await askName('새 작업 이름'); if (t?.trim()) await move(cards, { newTitle: t.trim() }) }
  const reopen = async () => { if (!task) return; try { await api('/context/reopen', { body: { bot, task: task.id } }); say('다시 열었어요'); load() } catch (e) { say(errMsg(e)) } }
  const drop = (e: DragEvent, to: string) => { e.preventDefault(); setOver(''); try { const cards = JSON.parse(e.dataTransfer.getData(DRAG)) as string[]; if (cards.length) void move(cards, to) } catch { /* 다른 끌기 */ } }
  const dragOver = (e: DragEvent, id: string) => { if (e.dataTransfer.types.includes(DRAG)) { e.preventDefault(); setOver(id) } }
  const clickRow = (r: Row) => { if ('sessionId' in r.ref) go(bot, r.ref.sessionId); else if (openDoc) openDoc(bot, r.ref.file) }
  const sessionsOf = (t: CtxTask) => new Set(t.cards.map(sidOf)).size

  return <>
    <div className="modal-h cx-gvh"><button className="ib" onClick={back} title="상황판으로" aria-label="상황판으로"><Icon n="back" size={14} /></button>
      <div className="t"><b>{name}</b><span className="cnt">{g ? `${g.goal} · ${dueKo(g.due)}` : '불러오는 중…'}{note ? ` · ${note}` : ''}</span></div>
      <button className="ib" onClick={onClose} title="닫기 ⎋" aria-label="닫기"><Icon n="x" size={14} /></button></div>
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
        </div>) : <div className="bempty">{d ? '이 기간에 남은 이야기가 없어요' : '불러오는 중…'}</div>}
      </section>

      <ChatBox bot={bot} name={name} task={task} lastSid={sel === 'loose' ? null : lastSid} brief={d?.brief ?? ''} go={(b, sid) => { onClose(); go(b, sid) }} />
    </div>
  </>
}

/* ── 오른쪽 채팅 ─────────────────────────────────────────────────────────── */

type Target = 'cont' | 'new' | 'orch'
function ChatBox({ bot, name, task, lastSid, brief, go }: { bot: string; name: string; task: CtxTask | null; lastSid: string | null; brief: string; go: Go }) {
  const [to, setTo] = useState<Target>(task && lastSid ? 'cont' : 'new')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // 작업을 바꾸면 받는 쪽 기본값도 다시 — 작업이 있으면 그 세션 이어서, 목표 전체면 새 세션
  useEffect(() => { setTo(task && lastSid ? 'cont' : 'new') }, [task?.id, lastSid])
  const title = task?.title ?? name
  const sub = to === 'cont' ? `받는 쪽: ${name} 봇 · 그 세션을 이어 씀` : to === 'new' ? `받는 쪽: ${name} 봇 · 새 세션 «상황판 · ${title}»` : '받는 쪽: 오케스트레이터 · 새 세션'
  const send = async () => {
    const msg = text.trim(); if (!msg || busy) return
    setBusy(true); setErr('')
    const full = brief ? `${brief}\n\n${msg}` : msg
    try {
      const target = to === 'orch' ? 'orch' : bot
      const body = to === 'cont' && lastSid ? { text: full, sessionId: lastSid } : to === 'new' ? { text: full, name: `상황판 · ${title}` } : { text: full }
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
    <div className="cx-send"><span className="k">⌘↵</span><button className="btn on" disabled={busy || !text.trim()} onClick={() => void send()}><Icon n="send" size={12} />{busy ? '보내는 중…' : '보내기'}</button></div>
  </section>
}
