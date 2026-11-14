import { pickColor } from './ColorPick'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEsc } from './esc'
import type { AgentDef, Bot, HarnessDetail, HarnessItem, SessionInfo, TodoItem } from '../core/types'
import { copyImageWhy, copySay } from './clip'
import { copyFiles } from './fileCopy'
import { copyIntent } from '../core/copyIntent'
import { api } from './api'
import { isDoneSection, orderItems, orderSections, peekDone, staleProposal } from '../core/todo'
import { dueChipOf, dueText, quickDues, splitDue, bareDayAsk } from '../core/due'
import { sessionUnread } from '../core/unread'
import type { Overview } from '../core/overview'
import { ACT_COLOR, ACT_ICON, ACT_LABEL, LONG, actOf, buzz, slotOf, useSwipeCfg, type SwipeAct } from './swipe'
import { HOLD_MS, decide, dropIndex } from './gesture'
import { FolderBot, Icon, Mid } from './FolderBot'
import { FolderPicker, RoutineSheet, askConfirm, askName, type Say } from './Sheets'
import { describeCron, onceDone } from '../core/when'
import { Mark } from './Brand'
import { Float, anchorOf, type Anchor } from './Float'

/** 클립보드에 «그림 그대로» 넣을 수 있는 것들 */
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i
import { scoreName } from '../core/search'
import { fmtElapsed, fmtTime, useStore } from './store'
import { localBridge, openOnThisDevice } from './localOpen'

interface Node { name: string; rel: string; dir: boolean; mtime: number; size?: number; harness?: boolean; botId?: string }

/** 도구 막대가 여는 것 — 루틴 · 명령·스킬 · ⋯(이 봇) */
type ToolPop = { k: 'rt' | 'cmd' | 'more'; at: Anchor }
/** 할 일 칸은 접힌 채로 패널 높이의 이만큼까지만 쓴다 — 넘치면 «＋N 더» */
const TODO_CAP = 0.45

/**
 * 오른쪽 패널 — «이 폴더에서»: 개요 · 할 일(Inbox) · 파일(실제 트리) + 도구 막대(루틴 · 명령·스킬 · ⋯).
 *
 * 🔴 **가운데는 대화, 오른쪽은 폴더** (2026-11-12 Dave «가안» · 11/13 카드 «이대로 만든다»). 세션은 채팅 머리줄 아래의
 *    세션 줄(`SessionStrip.tsx`)로, 뒤에서 도는 일은 진행 줄의 팝오버(`Tasks.tsx`)로 갔다.
 * 🔴 **칸 높이를 손으로 맞추지 않는다** — 종전에는 할 일 칸이 고정 높이(끌어서 조절)여서 잘린 줄이 표시 없이 숨었다(11/12 리뷰).
 *    이제 할 일 칸은 내용만큼, 최대 패널의 45% 까지 쓰고 잘리면 «＋N 더» 로 말한다. 파일 칸이 남는 높이를 쓴다.
 * 🔴 **드물게 쓰는 것은 아래 도구 막대로** — 종전의 «명령 · 스킬» 절 · «루틴» 절 · 발의 «이 봇» 줄. 누르면 그 내용이 뜬다.
 */
export function Panel({ bot, sessions, go, onOpenFile, onTalk, onAttach, onMention, onStartAt, onNewFolderAt, touched, filesTick, onCollapse, say, refresh, activeDoc, focusSec, phone, onBack, only }: { bot: Bot; sessions: SessionInfo[]; sessionId?: string; go: (b: string, sid?: string) => void; onOpenFile: (rel: string, pin?: boolean) => void; onTalk: (t: string) => void; onAttach: (rel: string, dir?: boolean) => void; onMention: (rel: string) => void; onStartAt: (vaultRel: string, botId?: string) => void; onNewFolderAt: (vaultRel: string) => void; phone?: boolean; onBack?: () => void;
  /**
   * AD · **폰의 「할 일」 탭과 「폴더」 탭은 다른 화면이다** (2026-09-23 Dave: *«투두랑 폴더를 클릭했을 때 사실상
   * 똑같은 메뉴가 나오는데 그러면 의미가 없잖아»*). `only` 를 주면 그 화면만 보인다 —
   * 「할 일」 탭은 할 일 하나, 「폴더」 탭은 개요 · 파일 · 도구 막대(루틴 · ⋯). 명령·스킬은 폰에서 볼 일이 없어 뺀다(9/23).
   */
  only?: 'todo' | 'files'; touched: string[]; filesTick?: number; onCollapse: () => void; say: Say; refresh: () => Promise<void>; activeDoc: string | null; focusSec?: { sec: string; n: number } | null }) {
  const { s, loadTodo } = useStore()
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(`fb:secs:${bot.id}`) ?? '') } catch { return { todo: true, files: true } } })
  useEffect(() => { try { setOpen(JSON.parse(localStorage.getItem(`fb:secs:${bot.id}`) ?? '')) } catch { setOpen({ todo: true, files: true }) } }, [bot.id])
  useEffect(() => { localStorage.setItem(`fb:secs:${bot.id}`, JSON.stringify(open)) }, [open, bot.id])
  const tog = (k: string) => setOpen({ ...open, [k]: !open[k] })
  /** AG · **탭이 곧 그 절이면 늘 펼쳐져 있다** — 접는 손잡이(∨)와 실제로 보이는 것이 **같은 값**을 쓴다 */
  const secOn = (k: 'todo' | 'files') => (only === k ? true : !!open[k])
  // 아이콘 열에서 누른 섹션은 펼쳐진 채로 온다
  useEffect(() => { if (focusSec) setOpen((o) => ({ ...o, [focusSec.sec]: true })) }, [focusSec?.n])
  const [routines, setRoutines] = useState<boolean | string>(false)
  /** 도구 막대의 뜨는 것은 한 번에 하나 — 같은 단추를 다시 누르면 닫힌다(누르는 순간 열려 있었는지로 가린다 · 바깥 누르기가 먼저 닫기 때문) */
  const [pop, setPop] = useState<ToolPop | null>(null); const popDown = useRef('')
  const tb = (k: ToolPop['k'], right = false) => ({ onMouseDown: () => { popDown.current = pop?.k ?? '' }, onClick: (e: React.MouseEvent<HTMLButtonElement>) => { const was = (e.detail === 0 ? pop?.k ?? '' : popDown.current) === k; setPop(was ? null : { k, at: anchorOf(e.currentTarget, { right, gap: 6 }) }) } })
  useEffect(() => { setPop(null) }, [bot.id])
  const todos = (s.todos[bot.id] ?? [])
  const rtBad = bot.routines.some((r) => r.lastError && r.enabled !== false)
  const unreadAny = sessions.some((x) => sessionUnread(x.lastReplyAt, x.readAt))
  const readAll = async () => { const r = await api<{ read: number }>(`/bots/${bot.id}/read-all`, { body: {} }); say(r.read ? `${r.read}개 세션을 읽음으로 했어요` : '안 읽은 세션이 없어요') }
  return <div className="col side panel" style={{ width: '100%' }}>
    <div className="hdr">{phone ? <button className="rb glassb" onClick={onBack} title="봇 목록"><Icon n="list" size={20} /></button> : null}<span className="ttl">{only === 'todo' ? '할 일' : only === 'files' ? '폴더' : bot.orchestrator ? '이 볼트에서' : '이 폴더에서'}</span><span className="sp" />{!phone ? <div className="acts"><button className="ib on" onClick={onCollapse} title="패널 접기 (⌘⇧B)"><Icon n="panelr" size={14} /></button></div> : null}</div>
    {/* 개요 — 이 폴더가 어디까지 왔나. 오케스트레이터(«이 볼트에서»)는 자리를 비운다(볼트 요약을 둘지는 미정) · 폰 「할 일」 탭에는 없다 */}
    {!bot.orchestrator && only !== 'todo' ? <OverviewCard bot={bot} sessions={sessions} todos={todos} filesTick={filesTick} onOpenFile={onOpenFile} onTalk={onTalk} go={go} showTodo={() => setOpen((o) => ({ ...o, todo: true }))} /> : null}
    {/* 할 일 / Inbox — `only='todo'` 면 이 절 하나가 화면을 다 쓴다. 그 밖에는 내용만큼(최대 45%) · 잘리면 «＋N 더» */}
    {only === 'files' ? null : <ClampSec clamp={!only && secOn('todo')} all={!!open.todoAll} setAll={(v) => setOpen((o) => ({ ...o, todoAll: v }))} grow={only === 'todo'}>
      {bot.orchestrator ? <InboxSec open={secOn('todo')} tog={() => tog('todo')} onSend={onTalk} /> : <TodoSec bot={bot} items={todos} loading={!s.todos[bot.id]} open={secOn('todo')} tog={() => tog('todo')} onDelegate={(t) => onTalk(`${t.title}${t.desc ? ` — ${t.desc}` : ''}`)} onOpenFile={onOpenFile} reload={() => loadTodo(bot.id)} phone={phone} />}
    </ClampSec>}
    {only ? null : <div className="divy" />}
    {/* 파일 — 남는 높이를 다 쓴다 */}
    {only === 'todo' ? null : <div className="sec grow">
      <Tree bot={bot} phone={phone} open={secOn('files')} tog={() => tog('files')} onOpen={onOpenFile} onAttach={onAttach} onMention={onMention} onStartAt={onStartAt} onNewFolderAt={onNewFolderAt} touched={touched} tick={filesTick} say={say} active={activeDoc} />
    </div>}
    {/**
     * 도구 막대 — 루틴 N · 명령 · 스킬 · ⋯(이 봇).
     * 🔴 **AR · 루틴은 폰의 「폴더」 탭에도 있다** (2026-09-24 Dave: *«폴더 섹션에 모바일에서도 루틴 메뉴 추가해줘»*) — 「할 일」 탭에는 두지 않는다(그 탭은 지금 내가 할 일만 · AD).
     * 🔴 **명령 · 스킬은 폰에서 뺀다** (2026-09-23 Dave: *«하네스나 스킬 같은 건 모바일에서 보고 쓸 일이 없으니 제외»*) — 11/13 목업의 폰 그림에는 있었지만 날짜를 박아 정한 쪽을 따랐다.
     * 🔴 **AD · 「지우기 · 은퇴」는 폴더 탭 아래에만 작게** (2026-09-23 Dave) — ⋯ 안에 있다.
     */}
    {only === 'todo' ? null : <div className={`pfoot ptools ${only ? 'sm' : ''}`}>
      <button className={`tb rt ${pop?.k === 'rt' ? 'on' : ''}`} title="이 폴더의 루틴" {...tb('rt')}>루틴 <b className={rtBad ? 'bad' : ''}>{bot.routines.length}</b></button>
      {!bot.orchestrator && !only ? <button className={`tb cmd ${pop?.k === 'cmd' ? 'on' : ''}`} title="이 폴더에서 쓸 수 있는 명령 · 에이전트 · 스킬 · 커넥터" {...tb('cmd')}>명령 · 스킬</button> : null}
      <span className="sp" />
      <button className={`tb more ${pop?.k === 'more' ? 'on' : ''}`} title={bot.orchestrator ? '이 봇 — 모두 읽음 · 현황 묻기' : '이 봇 — 모두 읽음 · 색 · 빼기 · 은퇴'} aria-label="이 봇" {...tb('more', true)}><Icon n="more" size={14} /></button>
    </div>}
    {pop?.k === 'rt' ? <Float at={pop.at} onClose={() => setPop(null)} className="spop rtpop" width={260}><div onClick={() => setPop(null)} style={{ display: 'contents' }}>
      {/* CF-4 · 줄을 누르면 그 루틴이 골라진 채 열린다 · cron 원문 대신 사람 말 */}
      {bot.routines.map((r) => <button key={r.name} className="kv" onClick={() => setRoutines(r.name)}><Icon n="clock" size={12} color={r.lastError ? 'var(--err)' : 'var(--t3)'} /><span className="n">{r.name}</span><span className="rwhen">{r.enabled === false ? '꺼짐' : `${describeCron(r.cron)}${onceDone(r.cron) ? (r.lastError ? ' · 놓침' : ' · 끝남') : ''}`}</span></button>)}
      {bot.routines.length ? <hr className="shr" /> : null}
      <button className="kv" onClick={() => setRoutines(true)}><Icon n="plus" size={12} /><span className="n">{bot.routines.length ? '루틴 편집' : '루틴 추가'}</span></button>
    </div></Float> : null}
    {pop?.k === 'cmd' ? <Float at={pop.at} onClose={() => setPop(null)} className="spop cmdpop" width={300}><HarnessList bot={bot} onOpenFile={(rel) => { setPop(null); onOpenFile(rel) }} say={say} filesTick={filesTick} close={() => setPop(null)} /></Float> : null}
    {pop?.k === 'more' ? <Float at={pop.at} onClose={() => setPop(null)}><div onClick={() => setPop(null)} style={{ display: 'contents' }}>
      {unreadAny ? <button onClick={() => void readAll()}><Icon n="check" size={13} /><span>모두 읽음</span></button> : null}
      {bot.orchestrator ? <button onClick={() => onTalk('지금 뭐 돌고 있어? 봇별로 한 줄씩.')}><Icon n="sub" size={13} /><span>현황 물어보기</span></button> : <>
        <button onClick={() => pickColor(bot)}><span className="csdot" style={{ background: bot.color }} /><span style={{ flex: 1 }}>색 바꾸기</span></button>
        <button onClick={async () => { await api(`/bots/${bot.id}/stop`, { body: {} }); say(`${bot.name} 을 레일에서 덜어냈어요`); await refresh(); go('orch') }}><Icon n="x" size={13} /><span style={{ flex: 1 }}>지우기 (연결 해지)</span><span className="k">폴더 유지</span></button>
        <button className="warn" onClick={async () => { if (!(await askConfirm({ title: `${bot.name} 봇을 은퇴시킬까요?`, body: '폴더를 Archive 로 옮기고 봇을 쉬게 합니다. 세션 기록은 보관돼요.', ok: '은퇴', danger: true }))) return; try { await api(`/bots/${bot.id}/retire`, { body: {} }); say('옮기고 은퇴했어요'); await refresh(); go('orch') } catch (e) { say((e as Error).message) } }}><Icon n="archive" size={13} /><span style={{ flex: 1 }}>Archive 로 이동 (은퇴)</span></button>
      </>}
    </div></Float> : null}
    {routines ? <RoutineSheet bot={bot} pick={typeof routines === 'string' ? routines : undefined} onClose={() => setRoutines(false)} /> : null}
  </div>
}

/**
 * 개요 칸 — 이 폴더가 어디까지 왔나 (2026-11-13 Dave 카드 · 목업 «평소»).
 *
 * 🔴 **지어내지 않는다.** 호스트가 폴더에 있는 것만 모아 준다(`GET /bots/:id/overview` · `core/overview`) — 모델을 부르지 않는다.
 *    첫 줄은 `state.md` 의 «현재 목표» 줄 그대로, 줄 끝에 출처 파일과 시각.
 * 🔴 **`state.md` 가 없어도 칸을 비우지 않는다** — «없어요 — 봇에게 정리를 시키기» 한 줄이 선다.
 * ⚠ 세션 상태 · 할 일 · 파일이 바뀌면 다시 받는다. 받는 동안 옛 값을 그대로 둔다(깜빡이지 않게) — 다른 봇의 값만 안 보인다.
 */
function OverviewCard({ bot, sessions, todos, filesTick, onOpenFile, onTalk, go, showTodo }: { bot: Bot; sessions: SessionInfo[]; todos: TodoItem[]; filesTick?: number; onOpenFile: (rel: string) => void; onTalk: (t: string) => void; go: (b: string, sid?: string) => void; showTodo: () => void }) {
  const [got, setGot] = useState<{ id: string; ov: Overview } | null>(null)
  const sig = useMemo(() => `${sessions.map((x) => (x.state === 'awaiting_input' ? x.id : '')).join('')}|${todos.map((t) => `${t.done ? 1 : 0}${t.proposed ? 1 : 0}${t.due ?? ''}`).join(',')}`, [sessions, todos])
  useEffect(() => {
    let live = true
    const t = window.setTimeout(() => { void api<Overview>(`/bots/${bot.id}/overview`).then((ov) => { if (live) setGot({ id: bot.id, ov }) }).catch(() => { /* 못 받으면 옛 값을 둔다 */ }) }, 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [bot.id, sig, filesTick])
  const ov = got && got.id === bot.id ? got.ov : null
  if (!ov) return <div className="ovw" aria-busy="true"><div className="oh">개요</div><div className="tskel" role="status" aria-label="개요를 읽는 중"><div className="skel" style={{ width: '86%' }} /><div className="skel" style={{ width: '58%' }} /></div></div>
  const n = ov.mine.asks + ov.mine.proposed
  const due = ov.mine.due ? dueChipOf(ov.mine.due) : null
  const waiting = sessions.find((x) => x.state === 'awaiting_input')
  const src = [ov.hasState ? 'state.md' : '', todos.length ? 'todo.md' : ''].filter(Boolean)
  const at = ov.goalAt ? stamp(ov.goalAt) : ''
  return <div className="ovw">
    <div className="oh">개요</div>
    {!ov.hasState ? <button className="onone" onClick={() => onTalk('이 폴더의 state.md 를 만들어 지금 상태를 정리해 줘.')}>state.md 가 없어요 — 봇에게 정리를 시키기</button>
      : ov.goal ? <button className="og" title="state.md 열기" onClick={() => onOpenFile('state.md')}>{ov.goal}</button>
        : <button className="onone" onClick={() => onOpenFile('state.md')}>state.md 에 «현재 목표» 줄이 없어요 — 열어서 적기</button>}
    <div className="om">
      {n ? <span className="dot wait" /> : null}<b>{n ? `내가 나설 곳 ${n}` : '내가 나설 곳 없음'}</b>
      {ov.mine.asks ? <button title="답을 기다리는 세션으로" onClick={() => { if (waiting) go(bot.id, waiting.id) }}>· 답 대기 {ov.mine.asks}</button> : null}
      {ov.mine.proposed ? <button title="봇이 올린 제안 보기" onClick={showTodo}>· 제안 {ov.mine.proposed}</button> : null}
      {due ? <span className={due.tone === 'past' ? 'past' : ''} title={ov.mine.due}>· 마감 {due.text}</span> : null}
    </div>
    {ov.recent.length ? <div className="or"><span>최근 만든 것</span>{ov.recent.map((r) => <button key={r.rel} title={r.rel} onClick={() => onOpenFile(r.rel)}>· {r.rel.split('/').pop()}</button>)}</div> : null}
    {src.length || at ? <div className="os">{[...src, at].filter(Boolean).join(' · ')}</div> : null}
  </div>
}
const p2 = (x: number) => String(x).padStart(2, '0')
/** 개요 발의 시각 — «11/13 15:40»(24시간제) */
const stamp = (t: number): string => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${p2(d.getHours())}:${p2(d.getMinutes())}` }

/**
 * 잘린 칸은 잘렸다고 말한다 — 할 일 칸의 틀 (2026-11-13 Dave 카드 · 11/12 리뷰 «311px 중 92px 만 보이는데 표시가 없다»).
 *
 * 접힌 채로는 내용만큼, 최대 패널 높이의 45% 까지. 넘치면 아래를 흐리고 «＋N 더» 를 세운다(N = 가려진 할 일 줄 수).
 * 누르면 칸이 펼쳐져 파일 칸의 최소 높이만 남기고 다 쓰고(그래도 넘치면 칸 안에서 스크롤), «접기» 가 선다. 펼친 것은 봇마다 기억한다.
 * ⚠ 높이는 px 로 잰다 — `max-height:45%` 는 부모 높이가 «정해진 값» 일 때만 듣는데 패널은 늘어나는 칸이다.
 */
function ClampSec({ clamp, all, setAll, grow, children }: { clamp: boolean; all: boolean; setAll: (v: boolean) => void; grow?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [cap, setCap] = useState(0)
  const [cut, setCut] = useState<{ over: boolean; n: number }>({ over: false, n: 0 })
  useEffect(() => {
    if (!clamp) { setCut({ over: false, n: 0 }); return }
    const el = ref.current; const panel = el?.closest('.panel') as HTMLElement | null; if (!el || !panel) return
    const measure = () => {
      const c = Math.max(96, Math.round(panel.getBoundingClientRect().height * TODO_CAP)); setCap(c)
      const body = el.querySelector(':scope > .secb') as HTMLElement | null; if (!body) { setCut({ over: false, n: 0 }); return }
      // 펼친 채로는 «접으면 잘리나»(= 접기 단추를 세울지)를, 접힌 채로는 «지금 잘렸나» 를 본다 — 창이 낮으면 45% 보다 덜 받을 수도 있다
      if (all) { const head = body.getBoundingClientRect().top - el.getBoundingClientRect().top; setCut({ over: head + body.scrollHeight > c + 1, n: 0 }); return }
      body.scrollTop = 0
      if (body.scrollHeight <= body.clientHeight + 1) { setCut({ over: false, n: 0 }); return }
      const edge = body.getBoundingClientRect().bottom
      let n = 0; body.querySelectorAll('.todo:not(.addbtn):not(.add), .tprop').forEach((r) => { if (r.getBoundingClientRect().bottom > edge + 1) n++ })
      setCut((p) => (p.over && p.n === n ? p : { over: true, n }))
    }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(panel); ro.observe(el)
    const mo = new MutationObserver(measure); mo.observe(el, { childList: true, subtree: true, characterData: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [clamp, all])
  const folded = clamp && cut.over && !all
  return <div ref={ref} className={`sec ${grow ? 'grow' : 'tclamp'} ${folded ? 'cut' : ''} ${clamp && all ? 'all' : ''}`} style={clamp && !all && cap ? { maxHeight: cap } : undefined}>
    {children}
    {folded ? <button className="tmore" onClick={() => setAll(true)}>{cut.n ? `＋${cut.n} 더` : '더 보기'}</button> : null}
    {clamp && all && cut.over ? <button className="tless" onClick={() => setAll(false)}>접기</button> : null}
  </div>
}

/**
 * 명령 · 스킬 (V25 · 2026-09-13 Dave 승인) — «이 폴더에서 실제로 쓸 수 있는 것». 도구 막대의 단추가 연다(2026-11-14).
 *
 * 🔴 **폴더별 하네스의 집은 여기다.** 설정에도 같은 내용의 표가 있지만 그건 전체를 훑는 용도고,
 *    «지금 어느 폴더 이야기인가» 가 붙어 있는 자리는 이 패널뿐이다 (Dave: «이건 어떻게 보여져야 할지 고민»).
 * 🔴 **범위 칩이 출처다** — 사용자(모든 폴더) · 볼트 · 폴더 · 내장. 같은 이름이 겹치면 **폴더가 이긴다**.
 */
const SCOPE_T: Record<HarnessItem['scope'], string> = { folder: '이 폴더', root: '볼트', user: '사용자', builtin: '내장' }
interface CmdRow { name: string; desc: string; scope: 'folder' | 'root' | 'user'; rel: string | null }
function HarnessList({ bot, onOpenFile, say, filesTick, close }: { bot: Bot; onOpenFile: (rel: string) => void; say: Say; filesTick?: number; close: () => void }) {
  const [hz, setHz] = useState<HarnessDetail | null>(null)
  const [cmds, setCmds] = useState<CmdRow[] | null>(null)
  /** EA · 이 봇이 부를 수 있는 에이전트 정의(`.claude/agents`) — 폴더 것과 사용자 것. 읽기만 한다 */
  const [agents, setAgents] = useState<AgentDef[] | null>(null)
  const [all, setAll] = useState(false)
  useEffect(() => { void api<HarnessDetail>(`/harness?rel=${encodeURIComponent(bot.rel)}`).then(setHz).catch(() => setHz(null)) }, [bot.rel])
  useEffect(() => { void api<CmdRow[]>(`/bots/${bot.id}/commands`).then(setCmds).catch(() => setCmds([])) }, [bot.id, filesTick])
  useEffect(() => { void api<AgentDef[]>(`/bots/${bot.id}/agents`).then(setAgents).catch(() => setAgents([])) }, [bot.id, filesTick])
  const guides = hz ? [hz.claudeMd ? 'CLAUDE.md' : null, hz.agentsMd ? 'AGENTS.md' : null].filter(Boolean) as string[] : []
  /**
   * V · **한 목록에 명령·스킬·커넥터를 함께** (2026-09-22 Dave: «커맨드랑 스킬을 따로 구분하지 말고 한 공간에서 한 번에 볼 수는 없을까»).
   * 차례는 «내가 부르는 것 → 봇이 쓰는 것» — 슬래시 명령(`/이름`)이 먼저, 그다음 에이전트(봇이 일을 맡기는 상대 · EA), 스킬, 커넥터.
   * ⚠ 종류는 왼쪽 아이콘과 오른쪽 범위 칩이 말한다 — 섹션을 둘로 가르면 같은 것을 두 군데서 찾게 된다.
   */
  const rows = [
    ...(cmds ?? []).map((c) => ({ key: `cmd:${c.scope}:${c.name}`, icon: 'run' as const, name: `/${c.name}`, desc: c.desc, kind: '명령', scope: SCOPE_T[c.scope === 'root' ? 'root' : c.scope === 'user' ? 'user' : 'folder'], rel: c.rel ?? '', folder: c.scope === 'folder' })),
    ...(agents ?? []).map((a) => ({ key: `agent:${a.scope}:${a.name}`, icon: 'sub' as const, name: a.name, desc: a.desc, kind: '에이전트', scope: SCOPE_T[a.scope], rel: '', folder: a.scope === 'folder' })),
    ...(hz?.skillList ?? []).map((i) => ({ key: `skill:${i.name}`, icon: 'run' as const, name: i.name, desc: '', kind: '스킬', scope: SCOPE_T[i.scope], rel: '', folder: i.scope === 'folder' })),
    ...(hz?.mcpList ?? []).map((i) => ({ key: `mcp:${i.name}`, icon: 'plug' as const, name: i.name, desc: '', kind: '커넥터', scope: SCOPE_T[i.scope], rel: '', folder: i.scope === 'folder' }))
  ]
  const shown = all ? rows : rows.slice(0, 6)
  const create = async () => {
    const name = await askName('새 슬래시 명령 이름 (영문·숫자·-)', 'my-command')
    if (!name) return
    try { const r = await api<{ rel: string }>(`/bots/${bot.id}/commands`, { body: { name: name.trim().replace(/\.md$/, ''), scope: 'folder' } }); onOpenFile(r.rel) } catch (e) { say((e as Error).message) }
  }
  return <>
    <div className="ph"><span>명령 · 스킬</span><span className="c">{hz || cmds ? guides.length + rows.length : ''}</span><span className="sp" /><button className="ib nsb" title="새 슬래시 명령" onClick={() => { close(); void create() }}><Icon n="plus" size={12} /></button></div>
    <div className="hsec cmds">
      {guides.map((g) => <button className="hz" key={g} onClick={() => onOpenFile(g)}><Mark id={g === 'AGENTS.md' ? 'codex' : 'claude'} size={13} /><span className="n">{g}</span><span className="sc">지침 · 폴더</span></button>)}
      {shown.map((r) => <button className={`hz ${r.rel ? '' : 'ro'}`} key={r.key} title={r.rel ? '열어서 고치기' : `${r.kind} — 여기서는 못 고쳐요`} onClick={() => { if (r.rel) onOpenFile(r.rel) }}><Icon n={r.icon} size={13} color={r.folder ? 'var(--run)' : 'var(--t3)'} /><span className="n"><b>{r.name}</b>{r.desc ? <small> — {r.desc}</small> : null}</span><span className="sc">{r.kind} · {r.scope}</span></button>)}
      {(hz || cmds) && !rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>아직 없어요 — + 로 만들면 `/이름` 으로 부를 수 있어요</div> : null}
      {rows.length > 6 ? <button className="hz more" onClick={() => setAll(!all)}>{all ? '접기' : `+ ${rows.length - 6}개 더 보기`}</button> : null}
    </div>
  </>
}


export function Elapsed({ from }: { from?: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 1000); return () => window.clearInterval(t) }, [])
  return <>{fmtElapsed(from)}</>
}

/**
 * 할 일 2.0 (V15, Dave 승인 2026-09-13) — 패널은 todo.md 의 거울.
 * · 목록은 **제목 한 줄만**. 설명은 더블클릭(폰은 탭)으로 그 행을 펼칠 때만 보인다 — 설명이 있는 행에만 › 표식.
 * · 편집은 펼친 자리에서 **한 칸**에 «제목: 설명» (첫 «:» 앞이 제목 — 파일 형식 그대로).
 * · 문서의 `## 제목`(절)이 그대로 섹션이고, «완료» 절은 접힌 채로 시작한다.
 * · 체크하면 «완료» 절 끝으로 내려가고(파일에서도), 끌면 그 줄이 파일에서 옮겨진다.
 * · 「todo.md」 버튼으로 원문을 열어 자유롭게 고칠 수 있다 — 저장하면 이 패널이 따라온다(파일 감시).
 */
function TodoSec({ bot, items, loading = false, open, tog, onDelegate, onOpenFile, reload, phone }: { bot: Bot; items: TodoItem[]; /** CF ③ · 아직 못 받았다 — «없다» 와 «아직 모른다» 를 가른다 */ loading?: boolean; open: boolean; tog: () => void; onDelegate: (t: TodoItem) => void; onOpenFile: (rel: string) => void; reload: () => Promise<void>; phone?: boolean }) {
  const [adding, setAdding] = useState<string | null>(null); const [line, setLine] = useState('')
  const [edit, setEdit] = useState<number | null>(null); const [draft, setDraft] = useState('')
  const [openRows, setOpenRows] = useState<Set<number>>(() => new Set())
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({})
  /** AK · 절마다 «끝난 것 더보기» 를 폈나 — 기본은 최근 몇 개만 */
  const [allDone, setAllDone] = useState<Record<string, boolean>>({})
  const [drag, setDrag] = useState<number | null>(null); const [over, setOver] = useState<number | null>(null)
  const [cfg] = useSwipeCfg()
  const [sw, setSw] = useState<{ line: number; dx: number; w: number } | null>(null); const swRef = useRef<{ line: number; x0: number; y0: number; w: number; on: boolean; last: SwipeAct | null } | null>(null)
  const [sheet, setSheet] = useState<TodoItem | null>(null)
  useEsc(() => setSheet(null), !!sheet)
  /** 폰 편집 시트 — 제목·상세·절을 한 화면에서. `line < 0` 이면 «새 할 일» */
  const [esheet, setESheet] = useState<{ line: number; title: string; desc: string; section: string; due?: string | null } | null>(null)
  useEsc(() => setESheet(null), !!esheet)
  /** 폰 «길게 눌러 끌어 옮기기» — 집힌 줄, 손가락 위치, 놓일 자리 */
  const [dr, setDr] = useState<{ line: number; dy: number; at: number } | null>(null)
  const drRef = useRef<{ line: number; y0: number; x0: number; held: boolean; timer: number; centers: number[]; lines: number[]; idx: number } | null>(null)
  const [undo, setUndo] = useState<{ title: string; desc: string } | null>(null); const undoT = useRef<number | undefined>(undefined)
  /** CK-1 · 마감 칩을 눌러 연 날짜 고르기 */
  const [dueMenu, setDueMenu] = useState<{ t: TodoItem; at: Anchor } | null>(null)
  const setDue = async (t: TodoItem, due: string | null) => { setDueMenu(null); await api(`/bots/${bot.id}/todo/due`, { body: { line: t.line, due } }); await reload() }
  /** CK-3 · 봇이 제안만 한 줄 — 정식 목록과 따로 «제안» 칸에 모은다. [넣기] 해야 정식 할 일이 되고 Akiflow 로 간다 */
  const props = items.filter((t) => t.proposed && !t.done)
  const staleN = props.filter((t) => staleProposal(t)).length
  /** 제안한 지 — «오늘» · «N일 전» */
  const propAge = (d: string) => { const [y, m, dd] = d.split('-').map(Number); const n = Math.round((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime() - new Date(y, m - 1, dd).getTime()) / 86_400_000); return n <= 0 ? '오늘' : n === 1 ? '어제' : `${n}일 전` }
  const [showStale, setShowStale] = useState(false)
  const accept = async (t: TodoItem) => { await api(`/bots/${bot.id}/todo/accept`, { body: { line: t.line } }); await reload() }

  // 절 순서는 파일 순서 그대로. 절이 없는 파일이면 빈 이름 하나로 모인다
  const secs = useMemo(() => {
    const m = new Map<string, TodoItem[]>()
    for (const t of items) { if (t.proposed && !t.done) continue; const k = t.section; (m.get(k) ?? m.set(k, []).get(k)!).push(t) }
    // AK · 안 끝난 일이 있는 절이 먼저 (차례만 바꾼다 — 파일은 그대로)
    return orderSections([...m.entries()])
  }, [items])
  const left = items.filter((t) => !t.done && !t.proposed).length
  const doneN = items.filter((t) => t.done).length
  const secOpen = (name: string) => openSecs[name] ?? !isDoneSection(name)

  const toggle = async (t: TodoItem) => { await api(`/bots/${bot.id}/todo/toggle`, { body: { line: t.line, done: !t.done } }); setOpenRows(new Set()); setEdit(null); await reload() }
  const startEdit = (t: TodoItem) => { setEdit(t.line); setDraft(t.desc ? `${t.title}: ${t.desc}` : t.title) }
  /** 편집을 시작할 때의 글 — 안 바뀌었으면 저장하지 않고, 원래 끝이 «3일»·«금요일» 같은 말이면 그것을 마감으로 읽지 않는다(리뷰 10/16: «연차 3일» 이 마감이 됐다) */
  const draftOf = (line: number) => { const t = items.find((x) => x.line === line); return t ? (t.desc ? `${t.title}: ${t.desc}` : t.title) : '' }
  const save = async () => {
    if (edit === null) return
    const orig = draftOf(edit)
    if (draft.trim() === orig.trim()) { setEdit(null); return }
    const { text: raw, due } = splitDue(orig) .due ? { text: draft.trim(), due: undefined } : splitDue(draft.trim()); if (!raw) { setEdit(null); return }
    const c = raw.indexOf(':')
    const title = c > 0 ? raw.slice(0, c).trim() : raw
    const desc = c > 0 ? raw.slice(c + 1).trim() : ''
    await api(`/bots/${bot.id}/todo/edit`, { body: { line: edit, title, desc, ...(due ? { due } : {}) } }); setEdit(null); await reload()
  }
  const add = async (section: string) => {
    // CK-1 · 끝에 «내일»·«10/20»·«금요일» 을 쓰면 마감이 된다 — 입력칸 아래에 «10월 20일(화) 마감» 으로 되읽어 준다
    const { text: raw, due } = splitDue(line.trim()); if (!raw) { setAdding(null); setLine(''); return }
    const c = raw.indexOf(':')
    await api(`/bots/${bot.id}/todo`, { body: { title: c > 0 ? raw.slice(0, c).trim() : raw, desc: c > 0 ? raw.slice(c + 1).trim() : '', section, ...(due ? { due } : {}) } })
    setLine(''); await reload()
  }
  const remove = async (t: TodoItem) => {
    await api(`/bots/${bot.id}/todo/delete`, { body: { line: t.line } }); setEdit(null)
    setUndo({ title: t.title, desc: t.desc }); window.clearTimeout(undoT.current); undoT.current = window.setTimeout(() => setUndo(null), 5000)
    await reload()
  }
  const undoRemove = async () => { if (!undo) return; await api(`/bots/${bot.id}/todo`, { body: { title: undo.title, desc: undo.desc } }); setUndo(null); await reload() }
  const drop = async (before: number | null) => {
    const from = drag; setDrag(null); setOver(null)
    if (from === null || from === before) return
    await api(`/bots/${bot.id}/todo/move`, { body: { line: from, before } }); setOpenRows(new Set()); await reload()
  }
  const toggleRow = (t: TodoItem) => { if (!t.desc) return; setOpenRows((o) => { const n = new Set(o); if (n.has(t.line)) n.delete(t.line); else n.add(t.line); return n }) }

  /** 절을 바꾼다 — «완료» 경계를 넘으면 체크가 함께 바뀌고, 그 밖은 자리 이동만으로 절이 바뀐다 */
  const moveToSection = async (t: TodoItem, to: string) => {
    if (to === t.section) return
    if (isDoneSection(to) !== isDoneSection(t.section)) { await toggle(t); return }
    const first = items.find((x) => x.section === to)
    await api(`/bots/${bot.id}/todo/move`, { body: { line: t.line, before: first ? first.line : null } })
    setOpenRows(new Set()); await reload()
  }

  /** 편집 시트 저장 — 제목·상세를 쓰고, 절이 바뀌었으면 이어서 옮긴다 */
  const saveSheet = async () => {
    const e = esheet; if (!e) return
    // 고치는 줄은 원래 제목 끝이 날짜 말이었으면 그대로 둔다(그건 제목이다)
    const origT = e.line >= 0 ? items.find((x) => x.line === e.line)?.title ?? '' : ''
    const sp = e.line >= 0 && splitDue(origT).due ? { text: e.title.trim(), due: undefined } : splitDue(e.title.trim()); const title = sp.text; if (!title) { setESheet(null); return }
    const due = e.due === undefined ? sp.due : e.due   // 시트에서 고른 마감이 먼저, 없으면 제목 끝의 «내일» 같은 말
    if (e.line < 0) { await api(`/bots/${bot.id}/todo`, { body: { title, desc: e.desc.trim(), section: e.section, ...(due ? { due } : {}) } }); setESheet(null); await reload(); return }
    await api(`/bots/${bot.id}/todo/edit`, { body: { line: e.line, title, desc: e.desc.trim(), ...(due !== undefined ? { due } : {}) } })
    setESheet(null); await reload()
    const t = items.find((x) => x.line === e.line)
    if (t && e.section !== t.section) await moveToSection({ ...t, title, desc: e.desc }, e.section)
  }

  /** 쓸어서 처리 — 폰에서만. 처음 움직임이 세로면 목록 스크롤에 양보하고 다시는 가로로 보지 않는다 */
  const run = async (t: TodoItem, act: SwipeAct) => {
    if (act === 'edit') { if (phone) setESheet({ line: t.line, title: t.title, desc: t.desc, section: t.section }); else startEdit(t) }
    else if (act === 'done') await toggle(t)
    else if (act === 'delete') await remove(t)
    else if (act === 'delegate') onDelegate(t)
    else if (act === 'expand') toggleRow(t)
    else if (act === 'menu') setSheet(t)
  }
  /**
   * 폰 목록 손가락 하나 — **쓸기 · 집기 · 스크롤을 한 핸들러에서 가른다**.
   * 🔴 종전에 두 핸들러(`swipeOn`·`dragOn`)를 따로 두고 JSX 에서 두 번 펼쳤더니 **뒤에 펼친 쪽이 앞을 덮어써서**
   *    쓸기가 통째로 죽었다(스모크가 잡았다). 같은 이벤트를 두 곳에서 받지 않는다.
   * 국면 판정은 `client/gesture.ts` 의 순수 함수 하나(유닛테스트로 고정).
   */
  const touchOn = (t: TodoItem, list: TodoItem[]) => (!phone ? {} : {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' || edit === t.line) return
      const el = e.currentTarget as HTMLElement
      swRef.current = { line: t.line, x0: e.clientX, y0: e.clientY, w: el.getBoundingClientRect().width, on: false, last: null }
      const wrap = el.closest('.secb') as HTMLElement | null
      const rows = wrap ? (Array.from(wrap.querySelectorAll('[data-line]')) as HTMLElement[]) : []
      const mine = rows.filter((r) => list.some((x) => x.line === Number(r.dataset.line)))
      drRef.current = {
        line: t.line, y0: e.clientY, x0: e.clientX, held: false, idx: -1,
        centers: mine.map((r) => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 }),
        lines: mine.map((r) => Number(r.dataset.line)),
        timer: window.setTimeout(() => {
          const r = drRef.current; if (!r || r.line !== t.line) return
          r.held = true; swRef.current = null; setSw(null); buzz(cfg.haptics, 16)
          setDr({ line: t.line, dy: 0, at: r.lines.indexOf(t.line) })
        }, HOLD_MS)
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = drRef.current; if (!d || d.line !== t.line) return
      const dx = e.clientX - d.x0, dy = e.clientY - d.y0
      const ph = decide(dx, dy, d.held)
      if (ph === 'drag') {
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 합성 이벤트에서 던질 수 있다 */ }
        const rest = d.centers.filter((_, i) => d.lines[i] !== t.line)
        const at = dropIndex(rest, e.clientY)
        if (at !== d.idx) { d.idx = at; buzz(cfg.haptics, 6) }
        setDr({ line: t.line, dy, at }); return
      }
      if (ph === 'scroll') { window.clearTimeout(d.timer); drRef.current = null; swRef.current = null; setSw(null); return }
      if (ph !== 'swipe') return
      window.clearTimeout(d.timer)                       // 가로로 먼저 움직였다 — 집기는 취소
      const r = swRef.current; if (!r) return
      if (!r.on) { r.on = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* 무시 */ } }
      const act = actOf(cfg, slotOf(dx, r.w))
      if (act !== r.last) { r.last = act; if (act) buzz(cfg.haptics) }
      setSw({ line: t.line, dx, w: r.w })
    },
    onPointerUp: () => {
      const d = drRef.current; drRef.current = null
      const r = swRef.current; swRef.current = null
      const curSw = sw; setSw(null)
      const curDr = dr; setDr(null)
      if (d) window.clearTimeout(d.timer)
      if (d?.held && curDr) {                            // 놓는다 — 그 자리에 들어간다
        const rest = d.lines.filter((l) => l !== t.line)
        const before = curDr.at >= rest.length ? null : rest[curDr.at]
        if (before !== t.line) void (async () => { await api(`/bots/${bot.id}/todo/move`, { body: { line: t.line, before } }); setOpenRows(new Set()); await reload() })()
        return
      }
      if (!r || !r.on || !curSw) return
      const act = actOf(cfg, slotOf(curSw.dx, curSw.w)); if (act) void run(t, act)
    },
    onPointerCancel: () => { const d = drRef.current; if (d) window.clearTimeout(d.timer); drRef.current = null; swRef.current = null; setSw(null); setDr(null) }
  })

  /**
   * CK-1 · 마감 칩 — `오늘`(주황) · `N일 지남`(빨강) · `내일`·`D-3`(강조) · 그 뒤 `D-N`/`M/D`. 끝난 일에는 안 단다.
   * 누르면 날짜 고르기(오늘 · 내일 · 이번 주 금 · 다음 주 월 · 날짜 고르기 · 지우기). 폰은 편집 시트에서 고른다.
   */
  const dueBadge = (t: TodoItem, small: boolean) => {
    // 마감이 없으면 칩을 두지 않는다 — 마감 정하기는 손을 올리면 뜨는 오른쪽 도구 칸의 📅 하나로 한다(2026-11-01 Dave «왜 캘린더 아이콘이 두 개야» · 종전엔 제목 옆에 흐린 📅 가 하나 더 떴다)
    if (!t.due || t.done) return null
    const ch = dueChipOf(t.due); if (!ch) return null
    return small ? <span className={`duec sm ${ch.tone}`} title={`${dueText(t.due)} 마감`}>{ch.text}</span>
      : <button className={`duec ${ch.tone}`} title={`${dueText(t.due)} 마감 — 눌러 바꾸기`} onClick={(e) => { e.stopPropagation(); setDueMenu({ t, at: anchorOf(e.currentTarget as HTMLElement, { gap: 4 }) }) }}>{ch.text}</button>
  }
  /**
   * 폰 행 (V19 승인분) — 동그란 체크 22px · 제목이 남은 폭을 **전부** 쓰고 두 줄까지 · ↳ 설명 한 줄.
   * ⛔ 오른쪽에 꺾쇠를 두지 않는다(그 자리가 «오른쪽 여백» 의 원인이었다) · ⛔ 태그·칩을 두지 않는다(Dave).
   * 탭하면 펼쳐져 상세 전체와 할 일거리가 나온다.
   */
  const phoneRow = (t: TodoItem, isOpen: boolean) => <div className={`ptodo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''}`} onClick={() => toggleRow(t)}>
    <button className="ring" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={12} color="var(--onAccent)" /> : null}</button>
    <div className="tdb">
      <div className="tt">{t.title}{dueBadge(t, true)}</div>
      {t.desc && !isOpen ? <div className="dsub"><span className="ar">↳</span><span className="tx">{t.desc.replace(/\s*\n+\s*/g, ' · ').trim()}</span></div> : null}
      {isOpen ? <>
        {t.desc ? <div className="dsc">{t.desc}</div> : null}
        <div className="acts" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setESheet({ line: t.line, title: t.title, desc: t.desc, section: t.section })}><Icon n="edit" size={12} />편집</button>
          {!t.done ? <button onClick={() => onDelegate(t)}><Icon n="sub" size={12} />맡기기</button> : null}
          <button onClick={() => onOpenFile('todo.md')}><Icon n="doc" size={12} />문서에서 보기</button>
        </div>
      </> : null}
    </div>
  </div>

  /** 행 알맹이 — 체크 + 제목(+펼친 설명) + 표식 + 도구. 폰에서는 스와이프 껍데기 안에 들어간다 */
  const rowInner = (t: TodoItem, isOpen: boolean) => <div
      className={`todo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''}`}
      onDoubleClick={phone ? undefined : () => toggleRow(t)} onClick={phone ? () => toggleRow(t) : undefined}>
      <button className="bx" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={9} /> : null}</button>
      <div className="tdb">
        <div className="tt">{t.title}{t.by === 'bot' ? <span className="byb" title="봇이 적음"><Icon n="sub" size={10} /></span> : null}</div>
        {isOpen && t.desc ? <div className="dsc">{t.desc}</div> : null}
      </div>
      {t.desc ? <span className="mk"><Icon n={isOpen ? 'chevd' : 'chev'} size={9} /></span> : null}
    </div>

  const row = (t: TodoItem) => {
    const isOpen = openRows.has(t.line)
    if (edit === t.line) return <div key={t.line} className="todo edit">
      <span className="bx ghost" />
      <div className="tdb">
        <input autoFocus className="ein" value={draft} placeholder="제목: 설명" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEdit(null) }} onBlur={() => void save()} />
        <div className="eh"><span>⏎ 저장</span><span>⎋ 취소</span><span className="sp" /><span>«:» 뒤는 설명</span></div>
      </div>
    </div>
    const cur = sw && sw.line === t.line ? sw : null
    const act = cur ? actOf(cfg, slotOf(cur.dx, cur.w)) : null
    const long = !!cur && Math.abs(cur.dx) / Math.max(1, cur.w) >= LONG
    if (phone) {
      const lifted = dr && dr.line === t.line
      const secList = secs.find(([, l]) => l.some((x) => x.line === t.line))?.[1] ?? []
      return <div key={t.line} data-line={t.line} className={`swwrap ${act ? 'armed' : ''} ${lifted ? 'lift' : ''}`}
        style={lifted ? { transform: `translateY(${dr!.dy}px)`, zIndex: 3 } : act ? { background: `color-mix(in srgb, ${ACT_COLOR[act]} ${long ? 100 : 45}%, var(--bg))` } : undefined}>
        {act && !lifted ? <div className={`swhint ${cur!.dx > 0 ? 'l' : 'r'}`}><span className={`cir ${long ? 'on' : ''}`} style={long ? { color: ACT_COLOR[act] } : undefined}><Icon n={ACT_ICON[act] as 'edit'} size={15} /></span>{long ? <b>{ACT_LABEL[act]}</b> : null}</div> : null}
        <div className="swrow" style={cur && !lifted ? { transform: `translateX(${Math.max(-0.72 * cur.w, Math.min(0.72 * cur.w, cur.dx))}px)`, transition: 'none' } : undefined}
          {...touchOn(t, secList)}>{phoneRow(t, isOpen)}</div>
      </div>
    }
    return <div key={t.line}
      className={`todo ${t.done ? 'done' : ''} ${isOpen ? 'on' : ''} ${over === t.line ? 'over' : ''} ${drag === t.line ? 'dragging' : ''}`}
      draggable={!phone} onDragStart={() => setDrag(t.line)} onDragEnd={() => { setDrag(null); setOver(null) }}
      onDragOver={(e) => { if (drag === null) return; e.preventDefault(); setOver(t.line) }} onDragLeave={() => setOver((o) => (o === t.line ? null : o))}
      onDrop={(e) => { e.preventDefault(); void drop(t.line) }}
      onDoubleClick={phone ? undefined : () => toggleRow(t)} onClick={phone ? () => toggleRow(t) : undefined}>
      <button className="bx" onClick={(e) => { e.stopPropagation(); void toggle(t) }} aria-label={t.done ? '되돌리기' : '완료'}>{t.done ? <Icon n="check" size={9} /> : null}</button>
      <div className="tdb">
        {/* CK-1 · 마감 칩은 제목 바로 옆 — 오른쪽 끝은 손을 올리면 도구 줄이 덮는 자리라 칩을 누를 수 없다(스모크가 잡았다) */}
        <div className="tt dueln" onClick={(e) => { if (isOpen) { e.stopPropagation(); startEdit(t) } }} title={phone ? '누르면 펼치기' : '더블클릭하면 펼치기'}><span className="ttx">{t.title}</span>{t.by === 'bot' ? <span className="byb" title="봇이 적음"><Icon n="sub" size={10} /></span> : null}{dueBadge(t, false)}{t.ak && !phone ? <span className="akb" title="Akiflow 와 짝 — 제목·설명·완료·마감이 같이 움직여요">Akiflow</span> : null}</div>
        {isOpen && t.desc ? <div className="dsc" onClick={(e) => { e.stopPropagation(); startEdit(t) }}>{t.desc}</div> : null}
      </div>
      {t.desc ? <span className="mk"><Icon n={isOpen ? 'chevd' : 'chev'} size={9} /></span> : null}
      <span className="tools" onClick={(e) => e.stopPropagation()}>
        {!t.done ? <button title={t.due ? `마감 ${dueText(t.due)} — 바꾸기` : '마감 정하기'} onClick={(e) => setDueMenu({ t, at: anchorOf(e.currentTarget as HTMLElement, { gap: 4 }) })}><Icon n="cal" size={12} /></button> : null}
        <button title="편집" onClick={() => startEdit(t)}><Icon n="edit" size={12} /></button>
        {!t.done ? <button title="봇에게 맡기기" onClick={() => onDelegate(t)}><Icon n="sub" size={12} /></button> : null}
        <button title="삭제" onClick={() => void remove(t)}><Icon n="x" size={12} /></button>
      </span>
    </div>
  }

  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>할 일</span><span className="c">{loading ? '' : left}{doneN ? ` · 완료 ${doneN}` : ''}</span>
      <span className="tools">
        <span className="ib" title="새 할 일" onClick={(e) => { e.stopPropagation(); const sec0 = secs.find(([n2]) => !isDoneSection(n2))?.[0] ?? secs[0]?.[0] ?? ''; if (phone) setESheet({ line: -1, title: '', desc: '', section: sec0 }); else setAdding(sec0) }}><Icon n="plus" size={12} /></span>
        <span className="ib mdb" title="todo.md 를 열어 원문 고치기" onClick={(e) => { e.stopPropagation(); onOpenFile('todo.md') }}><Icon n="doc" size={11} /><span>todo.md</span></span>
      </span>
    </button>
    {open ? <div className="secb" style={{ padding: '0 0 6px' }} onDragOver={(e) => { if (drag !== null) e.preventDefault() }} onDrop={(e) => { e.preventDefault(); void drop(null) }}>
      {/* 🔴 CF ③ (2026-10-19 Dave · 목업 «할 일 칸») — 받는 중에 «할 일이 없어요» 는 틀린 말이다. 받는 중이면 회색 줄 둘, 받았는데 비었을 때만 «없어요» */}
      {!items.length ? (loading ? <div className="tskel" role="status" aria-label="할 일을 읽는 중"><div className="skel" style={{ width: '80%' }} /><div className="skel" style={{ width: '64%' }} /></div> : <div className="kv" style={{ color: 'var(--t3)' }}>할 일이 없어요 — + 로 적거나 todo.md 를 여세요</div>) : null}
      {/* 🔴 CK-3 · 봇의 제안 — [넣기] 한 것만 정식 할 일이 되고 Akiflow 로 간다. [버리기] 는 그 줄을 지운다 */}
      {props.length ? <div className="tprops">
        <div className="tsec ph"><Icon n="sub" size={10} /><span>제안</span><span className="c">{props.length}</span><span className="sp" /><span className="why">봇이 올림 · 넣어야 할 일이 돼요</span></div>
        {props.filter((t) => showStale || !staleProposal(t)).map((t) => <div key={t.line} className={`tprop ${staleProposal(t) ? 'stale' : ''}`} data-line={t.line}>
          {edit === t.line && !phone ? <div className="tdb"><input autoFocus className="ein" value={draft} placeholder="제목: 설명" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { e.preventDefault(); setEdit(null) } }} onBlur={() => void save()} /></div>
            : <div className="tdb"><div className="tt">{t.title}{dueBadge(t, true)}</div><div className="dsub"><span className="pby">{bot.displayName || bot.name} 봇{t.proposedAt ? ` · ${propAge(t.proposedAt)}` : ''}</span>{t.desc ? <span className="tx"> · {t.desc.replace(/\s*\n+\s*/g, ' · ').trim()}</span> : null}</div></div>}
          <span className="pacts"><button className="ok" onClick={() => void accept(t)}>넣기</button><button onClick={() => (phone ? setESheet({ line: t.line, title: t.title, desc: t.desc, section: t.section, due: t.due ?? null }) : startEdit(t))}>고치기</button><button className="no" onClick={() => void remove(t)}>버리기</button></span>
        </div>)}
        {staleN ? <button className="todo addbtn more pstale" onClick={() => setShowStale(!showStale)}><span className="bx ghost" /><span>{showStale ? '7일 지난 제안 접기' : `7일 지난 제안 ${staleN}개 — 접어 뒀어요`}</span></button> : null}
      </div> : null}
      {secs.map(([name, list]) => <div key={name || '_'}>
        {name ? <button className="tsec" onClick={() => setOpenSecs({ ...openSecs, [name]: !secOpen(name) })}><Icon n={secOpen(name) ? 'chevd' : 'chev'} size={9} /><span>{name}</span><span className="c">{list.length}</span></button> : null}
        {secOpen(name) ? <>
          {/* 🔴 AK · 안 끝난 것이 위, 끝난 것은 **최근 몇 개**만 (2026-09-24 Dave). 차례 규칙은 `core/todo` */}
          {orderItems(list).filter((t) => !t.done).map(row)}
          {(() => { const { rows, hidden } = peekDone(list, undefined, !!allDone[name]); return <>
            {rows.map(row)}
            {hidden ? <button className="todo addbtn more" onClick={() => setAllDone({ ...allDone, [name]: true })}><span className="bx ghost" /><span>끝난 일 {hidden}개 더보기</span></button>
              : allDone[name] && rows.length > 3 ? <button className="todo addbtn more" onClick={() => setAllDone({ ...allDone, [name]: false })}><span className="bx ghost" /><span>끝난 일 접기</span></button> : null}
          </> })()}
          {adding === name ? <div className="todo add"><span className="bx ghost" /><div className="tdb"><input autoFocus className="ein" placeholder="제목: 설명 (Enter) · 끝에 «내일»·«10/20» 이면 마감" value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(name); if (e.key === 'Escape') { setAdding(null); setLine('') } }} onBlur={() => { if (!line.trim()) setAdding(null) }} />{(() => { const d = splitDue(line).due; if (d) return <div className="duehint"><Icon n="cal" size={10} />{dueText(d)} 마감</div>; const n = bareDayAsk(line); return n ? <div className="duehint ask"><Icon n="cal" size={10} />«{n}» 은 마감으로 안 읽어요 — {n}일 마감이면 «{n}일» 로 써 주세요</div> : null })()}</div></div>
            : !isDoneSection(name) ? <button className={`todo addbtn ${phone ? 'ph' : ''}`} onClick={() => (phone ? setESheet({ line: -1, title: '', desc: '', section: name }) : setAdding(name))}><span className="bx ghost dash" /><span>새 할 일</span></button> : null}
        </> : null}
      </div>)}
      {undo ? <div className="kv" style={{ color: 'var(--t3)' }}><span className="n">삭제했어요</span><button style={{ color: 'var(--t2)' }} onClick={() => void undoRemove()}>되돌리기</button></div> : null}
    </div> : null}
    {dueMenu ? <Float at={dueMenu.at} onClose={() => setDueMenu(null)} className="menu duem">
      <div className="h">{dueMenu.t.due ? `${dueText(dueMenu.t.due)} 마감` : '마감 정하기'}</div>
      {quickDues().map((q) => <button key={q.label} className={dueMenu.t.due === q.date ? 'on' : ''} onClick={() => void setDue(dueMenu.t, q.date)}><span style={{ flex: 1 }}>{q.label}</span><span className="k">{dueText(q.date)}</span>{dueMenu.t.due === q.date ? <Icon n="check" size={11} /> : null}</button>)}
      <label className="dpick"><span style={{ flex: 1 }}>날짜 고르기</span><input type="date" defaultValue={dueMenu.t.due ?? ''} onChange={(e) => { if (e.target.value) void setDue(dueMenu.t, e.target.value) }} /></label>
      {dueMenu.t.due ? <button onClick={() => void setDue(dueMenu.t, null)}><span style={{ flex: 1, color: 'var(--err)' }}>마감 지우기</span></button> : null}
    </Float> : null}
    {sheet ? <><div className="backdrop" onClick={() => setSheet(null)} /><div className="tsheet">
      <div className="grip" />
      <div className="ti">{sheet.title}</div>
      {([['edit', '편집'], ['delegate', '봇에게 맡기기'], ['done', sheet.done ? '되돌리기' : '완료로'], ['delete', '삭제']] as [SwipeAct, string][]).map(([a2, l]) => <button key={a2} onClick={() => { const t = sheet; setSheet(null); void run(t, a2) }}><Icon n={ACT_ICON[a2] as 'edit'} size={16} />{l}</button>)}
    </div></> : null}
    {esheet ? <><div className="backdrop" onClick={() => setESheet(null)} /><div className="tsheet esheet">
      <div className="grip" />
      <div className="eh2"><b>{esheet.line < 0 ? '새 할 일' : '할 일 고치기'}</b>{esheet.line >= 0 ? <button className="del" onClick={() => { const t = items.find((x) => x.line === esheet.line); setESheet(null); if (t) void remove(t) }}>삭제</button> : null}</div>
      <label className="fld"><span>제목</span><input autoFocus value={esheet.title} placeholder="무엇을 할까요" onChange={(e) => setESheet({ ...esheet, title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void saveSheet() }} /></label>
      <label className="fld"><span>상세</span><textarea rows={3} value={esheet.desc} placeholder="없어도 됩니다" onChange={(e) => setESheet({ ...esheet, desc: e.target.value })} /></label>
      {/* CK-1 · 마감 — 바깥에서 정해진 날만. 제목 끝에 «내일» 이라고 써도 된다 */}
      {(() => { const cur = esheet.due === undefined ? (esheet.line >= 0 ? items.find((x) => x.line === esheet.line)?.due : undefined) ?? splitDue(esheet.title).due ?? null : esheet.due; return <div className="fsec fdue"><span>마감</span><span className="seg">
        {quickDues().map((q) => <button key={q.label} className={cur === q.date ? 'on' : ''} onMouseDown={(e) => e.preventDefault()} onClick={() => setESheet({ ...esheet, due: q.date })}>{q.label}</button>)}
        <label className="dpick"><input type="date" value={cur ?? ''} onChange={(e) => setESheet({ ...esheet, due: e.target.value || null })} /><span>{cur && !quickDues().some((q) => q.date === cur) ? dueText(cur) : '날짜'}</span></label>
        {cur ? <button className="clr" onMouseDown={(e) => e.preventDefault()} onClick={() => setESheet({ ...esheet, due: null })}>지우기</button> : null}
      </span>{cur ? <small className="dueread">{dueText(cur)} 마감</small> : null}</div> })()}
      <div className="fsec"><span>절</span><span className="seg">{secs.map(([n2]) => <button key={n2 || '_'} className={esheet.section === n2 ? 'on' : ''} onClick={() => setESheet({ ...esheet, section: n2 })}>{n2 || '할 일'}</button>)}</span></div>
      {/* 🔴 **시트 단추는 초점을 뺏지 않는다** (AD · 2026-09-23 실측 — 보내기 단추와 같은 고장).
          누르는 순간 입력칸에서 초점이 빠지면 키보드가 내려가고 **하단 탭이 올라오며 시트가 움직여**,
          mousedown 과 mouseup 사이에 단추가 자리를 옮겨 `click` 이 아예 안 난다. */}
      <div className="fbtn"><button className="cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setESheet(null)}>취소</button><button className="ok" onMouseDown={(e) => e.preventDefault()} onClick={() => void saveSheet()}>{esheet.line < 0 ? '추가' : '저장'}</button></div>
    </div></> : null}
  </>
}

function InboxSec({ open, tog, onSend }: { open: boolean; tog: () => void; onSend: (t: string) => void }) {
  const { s } = useStore()
  const [items, setItems] = useState<{ rel: string; name: string; dir: boolean; mtime: number }[]>([])
  useEffect(() => { void api<typeof items>('/inbox').then(setItems).catch(() => {}) }, [s.inbox])
  return <>
    <button className="sech" onClick={tog}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>Inbox</span><span className="c">{items.length}</span>{items.length ? <span className="tools on"><span className="ib" title="정리 제안 받기" onClick={(e) => { e.stopPropagation(); onSend('Inbox 를 규칙대로 정리해 줘. 어디로 옮길지 먼저 제안해.') }}><Icon n="sub" size={12} /></span></span> : null}</button>
    {open ? <div className="secb" style={{ padding: '0 0 6px' }}>{items.slice(0, 20).map((i) => <div key={i.rel} className="trow" style={{ ['--pad' as string]: '16px' }}><Icon n={i.dir ? 'folder' : 'doc'} size={12} color="var(--t3)" /><span className="n"><Mid s={i.name} /></span></div>)}{!items.length ? <div className="kv" style={{ color: 'var(--t3)' }}>정리할 게 없어요</div> : null}</div> : null}
  </>
}

/* ── 파일 트리 (게으른 로드) ── */
/**
 * 끄는 동안 칸 위·아래 끝에 가까이 가면 저절로 굴린다 (10/18) — 트리를 펼쳐 두면 목적지가 화면 밖에 있다.
 * dragover 는 커서가 멈춰 있어도 계속 오므로, 끝에서 가까울수록 한 번에 더 많이 굴린다.
 */
const EDGE_PX = 36
function edgeScroll(from: HTMLElement, y: number): void {
  let el: HTMLElement | null = from
  while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
  if (!el) return
  const r = el.getBoundingClientRect()
  if (y < r.top + EDGE_PX) el.scrollTop -= Math.ceil((r.top + EDGE_PX - y) / 3)
  else if (y > r.bottom - EDGE_PX) el.scrollTop += Math.ceil((y - (r.bottom - EDGE_PX)) / 3)
}

function Tree({ bot, phone, open, tog, onOpen, onAttach, onMention, onStartAt, onNewFolderAt, touched, tick, say, active }: { bot: Bot; phone?: boolean; open: boolean; tog: () => void; onOpen: (rel: string, pin?: boolean) => void; onAttach: (rel: string, dir?: boolean) => void; onMention: (rel: string) => void; onStartAt: (vaultRel: string, botId?: string) => void; onNewFolderAt: (vaultRel: string) => void; touched: string[]; tick?: number; say: Say; active: string | null }) {
  const [dirs, setDirs] = useState<Record<string, Node[]>>({})
  const refRootsRef = useRef<string[]>([])   // 참조 폴더의 봇 기준 rel — loadDir 이 먼저 정의돼서 ref 로 넘긴다
  const [exp, setExp] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]')) } catch { return new Set(['']) } })
  const [sort, setSort] = useState<'name' | 'mtime'>(() => (localStorage.getItem('fb:tsort') as 'name' | 'mtime') || 'name')
  const [filter, setFilter] = useState<string | null>(null)
  const [flash, setFlash] = useState<Set<string>>(new Set())
  const [ctx, setCtx] = useState<{ x: number; y: number; n: Node } | null>(null)
  const [sortMenu, setSortMenu] = useState(false)
  /**
   * 여러 개 고르기 (Rondo 이식 A6) — ⌘/⌃ 는 하나씩 더하고, ⇧ 는 **보이는 줄** 기준으로 사이를 채운다.
   * 🔴 «보이는 줄» 이 기준인 이유: 접힌 폴더 속까지 고르면 사람이 **안 본 것을 지우게** 된다.
   * ⚠ 고른 것은 화면에만 산다(새로 고치면 풀린다) — 되돌리기 어려운 일에 낡은 선택이 끼면 안 된다.
   */
  const [sel, setSel] = useState<Set<string>>(new Set())
  const lastSel = useRef<string | null>(null)
  const [hidden, setHidden] = useState(() => localStorage.getItem('fb:thidden') === '1')
  const [dropOn, setDropOn] = useState<string | null>(null)
  useEffect(() => { localStorage.setItem('fb:thidden', hidden ? '1' : '0') }, [hidden])
  /**
   * ⚠ `../` 로 시작하는 폴더는 **지금 이 봇의 참조 폴더 안일 때만** 읽는다 (BC · 2026-09-27 스모크가 잡았다).
   * 펼친 폴더 기억(`fb:tree:<봇>`)이 봇을 바꾸는 틈에 옆 봇으로 새는 일이 원래 있었는데, 참조 폴더 경로가 섞이자
   * 오케스트레이터가 `../../3. Area/…` 를 읽으려다 볼트 밖이 되어 호스트가 500 을 냈다.
   */
  const isRefRel = (rel: string) => !rel.startsWith('../') || refRootsRef.current.some((r) => rel === r || rel.startsWith(r + '/'))
  /**
   * CF-1 · 같은 폴더를 동시에 세 번 읽지 않는다 — 봇을 열 때 이펙트 셋이 같은 `ls` 를 겹쳐 쏘았다(2026-10-12 실측 A8).
   * ⚠ 읽는 도중에 또 부르면 **버리지 않고 끝난 뒤 한 번 더** 읽는다 — 그 사이 파일이 생겼을 수 있다(스모크 M-1 이 잡았다).
   */
  const lsReq = useRef(new Map<string, boolean>())
  const loadDir = async (rel: string): Promise<void> => {
    if (!isRefRel(rel)) return
    const k = `${bot.id}\n${rel}\n${hidden}`
    if (lsReq.current.has(k)) { lsReq.current.set(k, true); return }
    lsReq.current.set(k, false)
    try { const l = await api<Node[]>(`/bots/${bot.id}/ls?dir=${encodeURIComponent(rel)}${hidden ? '&all=1' : ''}`); setDirs((d) => ({ ...d, [rel]: l })) } catch { /* */ }
    const again = lsReq.current.get(k); lsReq.current.delete(k)
    if (again) return loadDir(rel)
  }
  useEffect(() => { setDirs({}); for (const d of exp) void loadDir(d) }, [hidden])
  useEffect(() => { setDirs({}); try { setExp(new Set(JSON.parse(localStorage.getItem(`fb:tree:${bot.id}`) ?? '[""]'))) } catch { setExp(new Set([''])) } }, [bot.id])
  useEffect(() => { localStorage.setItem(`fb:tree:${bot.id}`, JSON.stringify([...exp])); for (const d of exp) if (!dirs[d]) void loadDir(d) }, [exp, bot.id])
  useEffect(() => { localStorage.setItem('fb:tsort', sort) }, [sort])
  /**
   * 채팅의 **폴더 칩**이 «이 폴더 보여 줘» 하고 쏜다(`fb:reveal` · App.tsx `reveal`). 조상을 다 펼치고,
   * 그 폴더 자체도 펼치고, 1.4초 비춘다 — 봇이 파일을 건드렸을 때와 같은 몸짓이다.
   */
  /**
   * 🔴 **고른 것의 자리를 상자로 남긴다** (2026-10-02 Dave: «특정 폴더나 파일을 채팅이나 문서에서 선택하면 폴더에서도 해당
   *    폴더나 파일이 박싱이 되어서 위치를 표시해줘야 해» · 시안 C). 종전에는 폴더 칩만 1.4초 비추고 사라졌고, 파일 칩·문서 속
   *    링크는 트리에 아무 표시가 없었다(열린 문서는 옅은 바탕뿐이라 조상이 접혀 있으면 안 보였다).
   *  - 폴더 → 조상과 그 폴더를 펴고 상자 · 파일 → 조상만 펴고 상자 · 그 줄까지 스크롤
   *  - 상자는 사라지지 않는다 — 다른 것을 고르거나 트리에서 직접 누를 때까지 남는다
   * ⚠ `detail` 은 문자열(옛 폴더 칩 · 폴더로 본다) 또는 `{ rel, file }`.
   */
  const [box, setBox] = useState('')
  // 스크롤 요청은 **1.5초만 산다** — 줄이 늦게 그려지면 그때 한 번. 남아 있다가 엉뚱한 때(우클릭 메뉴가 뜬 직후) 칸을 밀면
  //  메뉴가 스크롤에 닫힌다(검사에서 실제로 그랬다)
  const scrollTo = useRef<{ rel: string; until: number } | null>(null)
  const showAt = (rel: string, file: boolean) => {
    if (!rel || rel.startsWith('..')) return
    const parts = rel.split('/').filter(Boolean)
    setExp((x) => { const n = new Set(x); for (let i = 1; i <= parts.length - (file ? 1 : 0); i++) n.add(parts.slice(0, i).join('/')); return n })
    setBox(rel); scrollTo.current = { rel, until: Date.now() + 1500 }
  }
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent).detail as string | { rel: string; file?: boolean } | undefined
      if (typeof d === 'string') showAt(d, false); else if (d?.rel) showAt(d.rel, !!d.file)
    }
    window.addEventListener('fb:reveal', f); return () => window.removeEventListener('fb:reveal', f)
  }, [])
  // 열린 문서 탭이 바뀌면 상자도 그 파일로 — «이 문서가 폴더 어디에 있나» 가 늘 보인다
  useEffect(() => { if (active) showAt(active, true) }, [active])
  // 상자 줄까지 스크롤 — 조상 폴더를 읽어 와 줄이 그려진 **뒤에** 한 번만(그 뒤로는 사람이 스크롤해도 끌어오지 않는다)
  useEffect(() => {
    const want = scrollTo.current; if (!want) return
    if (Date.now() > want.until) { scrollTo.current = null; return }
    if (document.querySelector('.menu.ctx')) return   // 우클릭 메뉴가 떠 있으면 칸을 밀지 않는다(메뉴가 스크롤에 닫힌다)
    const el = document.querySelector(`.trow[data-rel="${CSS.escape(want.rel)}"]`) as HTMLElement | null
    if (!el) return
    scrollTo.current = null
    // ⛔ `scrollIntoView` 를 쓰지 않는다 — 넘침을 숨긴 바깥 틀(앱 전체)까지 밀어 화면이 통째로 어긋난다(검사에서 다음 클릭이 빗나갔다).
    //    줄을 품은 **가장 가까운 스크롤 칸** 하나만 움직인다
    let sc = el.parentElement
    while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement
    if (!sc) return
    const er = el.getBoundingClientRect(), cr = sc.getBoundingClientRect()
    if (er.top < cr.top) sc.scrollTop -= cr.top - er.top + 6
    else if (er.bottom > cr.bottom) sc.scrollTop += er.bottom - cr.bottom + 6
  })
  // 봇이 파일을 쓰면: 펼친 폴더는 다시 읽고, 건드린 파일의 조상을 펼쳐 1.4초 비춘다
  useEffect(() => { if (!tick) return; for (const d of exp) void loadDir(d) }, [tick])
  useEffect(() => {
    if (!touched.length) return
    const rels = touched.map((p) => (p.startsWith(bot.abs + '/') ? p.slice(bot.abs.length + 1) : null)).filter((x): x is string => !!x)
    if (!rels.length) return
    setExp((e) => { const n = new Set(e); for (const r of rels) { const parts = r.split('/'); for (let i = 1; i < parts.length; i++) n.add(parts.slice(0, i).join('/')) } return n })
    setFlash(new Set(rels)); const t = window.setTimeout(() => setFlash(new Set()), 1400); return () => window.clearTimeout(t)
  }, [touched])
  /**
   * ⌘F — 🔴 **지금 보고 있는 칸에서 찾는다** (2026-09-13 Dave). 문서 열에 커서가 있으면 편집기의
   *    찾기(CodeMirror)가 이기고, 파일 칸이면 여기서 이름을 거른다.
   * ⚠ 판정 순서가 중요하다: 글 쓰는 중(입력칸·`contenteditable`)이면 **아무것도 가로채지 않는다** —
   *    맥 기본과 편집기의 것이 이겨야 한다(단축키 계약).
   */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (t?.closest?.('.col.doc')) return
      e.preventDefault()
      setFilter((f) => (f === null ? '' : f))
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  /**
   * 새로 만들기 · 복제 · Finder — 전부 **호스트**가 한다(가드도 거기 있다).
   * ⚠ 만드는 자리는 «누른 것이 폴더면 그 안, 파일이면 그 옆» 이다 — 사람이 기대하는 자리가 그쪽이다.
   */
  // Finder 를 여는 주체는 **언제나 호스트**다 — 원격에서는 이름으로 그걸 먼저 말한다
  const store = useStore().s
  const refreshStore = useStore().refresh
  const main = store.device.main, hostName = store.hostName
  /**
   * 참조 폴더 (BC · B안 · 2026-09-27 Dave 선택) — 파일 트리 **맨 아래에** 구분선 뒤로 잇는다. 🔴 **읽기만**:
   * 파일은 「폴더 외 문서」 창으로 열리고(rel 이 `../` 로 시작), 끌어 옮기기·이름 바꾸기·지우기·여러 개 고르기에 끼지 않는다
   * (내 파일 `rows` 와 따로 모은다 — 섞으면 ⇧ 고르기가 참조 파일까지 집어 지우기 메뉴에 올린다).
   * ＋ 는 파일 머리 도구와 맨 아래 줄 둘 다. ⋯ 에 빼기 · Finder · 여기서 봇 시작.
   */
  const refRoots = useMemo(() => {
    const root = store.root; const ups = bot.rel ? bot.rel.split('/').length : 0
    return (bot.refs ?? []).filter((a) => !!root && a.startsWith(root + '/')).map((a) => {
      const vrel = a.slice(root.length + 1)
      return { abs: a, vrel, rel: `${'../'.repeat(ups)}${vrel}`, name: vrel.slice(vrel.lastIndexOf('/') + 1) }
    })
  }, [bot.refs, bot.rel, store.root])
  refRootsRef.current = refRoots.map((r) => r.rel)
  type RefRoot = (typeof refRoots)[number]
  const [picking, setPicking] = useState(false)
  const [refMenu, setRefMenu] = useState<{ x: number; y: number; r: RefRoot } | null>(null)
  const addRef = async (vrel: string) => {
    await api(`/bots/${bot.id}/refs`, { body: { path: `${store.root}/${vrel}` } })   // 실패하면 고르기 창이 그 말을 띄운다
    await refreshStore(); setPicking(false); say('참조 폴더로 더했어요 — 새 세션부터 이 봇이 그 폴더를 읽어요')
  }
  const removeRef = async (r: RefRoot) => {
    try { await api(`/bots/${bot.id}/refs`, { body: { path: r.abs, remove: true } }); await refreshStore(); say(`${r.name} 을(를) 참조에서 뺐어요`) } catch (e) { say((e as Error).message) }
  }
  const dirOf = (n: Node) => (n.dir ? n.rel : n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '')
  const makeNew = async (n: Node, kind: 'note' | 'folder') => {
    const name = await askName(kind === 'folder' ? '새 폴더 이름' : '새 노트 이름 (.md 는 자동)', kind === 'folder' ? '새 폴더' : '새 노트')
    if (!name) return
    try {
      const r = await api<{ rel: string }>(`/bots/${bot.id}/new`, { body: { dir: dirOf(n), name, kind } })
      say(`${r.rel} 만들었어요`)
      if (kind === 'note') onOpen(r.rel, true)
    } catch (e) { say((e as Error).message) }
  }
  const dup = async (n: Node) => {
    try { const r = await api<{ rel: string }>(`/bots/${bot.id}/copy`, { body: { rel: n.rel } }); say(`${r.rel} 로 복제했어요`) } catch (e) { say((e as Error).message) }
  }
  const reveal = async (n: Node) => {
    // ⛔ 훅을 콜백 안에서 부르지 않는다 — 호스트 이름은 컴포넌트에서 미리 받아 둔다
    await openOnThisDevice(bot, n.rel, 'reveal', { main, hostName, phone: !!phone, say })   // 원격이면 이 기기의 Finder (E)
  }
  /**
   * 이미지 복사 — 🔴 **그림 그대로** 클립보드에. 경로를 복사해 봐야 붙여넣는 쪽은 글자를 받는다.
   * ⚠ 브라우저가 클립보드에 바로 받아 주는 것은 **PNG 뿐**이라, 다른 형식은 캔버스로 한 번 굽는다.
   */
  const copyImage = async (rel: string) => { const r = await copyImageWhy(`/api/bots/${bot.id}/raw?rel=${encodeURIComponent(rel)}&token=${encodeURIComponent(localStorage.getItem('folderbot:token') ?? '')}`, main ? `${bot.abs}/${rel}` : undefined); say(r.ok ? '이미지를 복사했어요' : r.why ?? '이 환경에서는 이미지 복사를 못 해요') }
  /** 지금 다루는 대상 — 우클릭한 줄이 **고른 것 안에 있으면** 고른 것 전부, 아니면 그 줄 하나 */
  const targets = (n: Node): string[] => (sel.has(n.rel) && sel.size > 1 ? [...sel] : [n.rel])
  /**
   * 휴지통으로 — 🔴 **지우지 않고 옮긴다**(볼트 안 `.folderbot/trash/`). ⌘Z 로 되돌아온다.
   * ⚠ 여럿을 고르고 눌렀으면 **몇 개인지** 를 물어본다 — «하나인 줄 알았는데 열 개» 가 제일 아프다.
   */
  const toTrash = async (n: Node) => {
    const rels = targets(n)
    const what = rels.length > 1 ? `${rels.length}개` : n.name
    // 묻지 않는다 — 볼트 안 `.folderbot/trash` 로 옮길 뿐이라 되돌릴 수 있다(2026-11-13 «지우기 확인 규칙»). 토스트의 되돌리기와 ⌘Z 가 같은 스냅샷을 무른다(폰에는 ⌘Z 가 없다)
    try {
      const r = await api<{ to: string[]; failed: string[] }>(`/bots/${bot.id}/trash`, { body: { rels } })
      setSel(new Set())
      const back = async () => {
        try {
          const list = await api<{ t: number; op: string; from: string; to: string }[]>('/undo')
          const hits = list.filter((e) => r.to.includes(e.to))
          for (const e of hits) await api('/undo', { body: { t: e.t } })
          say(hits.length ? `되돌렸어요 — ${hits.length > 1 ? `${hits.length}개` : hits[0].from.split('/').pop()}` : '되돌릴 게 없어요')
          refreshOpen()
        } catch (e2) { say((e2 as Error).message) }
      }
      say(r.failed.length ? `${r.to.length}개 옮기고 ${r.failed.length}개는 못 옮겼어요` : `${what} 를 휴지통으로 옮겼어요`, r.to.length ? { label: '되돌리기', run: back } : undefined)
      refreshOpen()
    } catch (e) { say((e as Error).message) }
  }
  /** 끌어다 놓아 옮기기 (A7) — 목적지는 **폴더 줄**이다. 같은 자리면 아무 일도 안 한다(호스트가 안다) */
  const moveTo = async (rels0: string[], dir: string) => {
    // 이미 그 폴더에 있는 것·자기 자신은 뺀다 — 제 줄이나 옆 파일 줄에 놓으면 아무 일도 없어야 한다
    const rels = rels0.filter((r) => r !== dir && (r.includes('/') ? r.slice(0, r.lastIndexOf('/')) : '') !== dir)
    if (!rels.length) return
    try {
      const r = await api<{ moved: { from: string; to: string }[]; failed: string[] }>(`/bots/${bot.id}/move`, { body: { rels, dir } })
      setSel(new Set())
      if (r.failed.length) say(`${r.moved.length}개 옮기고 ${r.failed.length}개는 못 옮겼어요`)
      else if (r.moved.length) say(`${r.moved.length > 1 ? `${r.moved.length}개를 ` : ''}${dir || '맨 위'} 로 옮겼어요`)
      refreshOpen()
    } catch (e) { say((e as Error).message) }
  }
  /** 이 줄에 놓으면 어디로 가나 — 폴더면 그 폴더, 파일이면 그 파일이 든 폴더('' = 맨 위) */
  const dropDir = (n: Node) => (n.dir ? n.rel : n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : '')
  /** 펼쳐 둔 폴더를 다시 읽는다 — 옮기고 치운 뒤에 화면이 낡아 있으면 안 된다 */
  const refreshOpen = () => { for (const d of exp) void loadDir(d) }
  /**
   * ⌘Z — **파일 쪽 되돌리기**(옮기기·치우기). 호스트가 남긴 스냅샷 중 가장 최근 것을 무른다.
   * ⛔ 글 쓰는 중(입력칸·편집기)에는 가로채지 않는다 — 맥 기본과 CodeMirror 의 것이 이긴다.
   * ⚠ 문서 열에 커서가 있으면 그쪽 편집기의 ⌘Z 다. 판정 순서는 ⌘F 와 같다.
   */
  /**
   * ⌘C = 파일 복사(고른 것) · ⌥⌘C = 경로 복사 (M-3). 판정은 `core/copyIntent` —
   * 🔴 md 를 누르면 편집기가 초점을 **가져가므로**(Y · Dave: «md 한 개만 안 된다») 「트리 행을 누른 뒤 문서 창을 안 만졌다」(`armed`)면
   *    편집기에 초점이 있어도 파일 복사다. 문서 창을 클릭·타이핑하면 풀린다. 글을 고른 채면 언제나 브라우저·편집기에 양보.
   */
  const armed = useRef(false)
  useEffect(() => {
    // ⚠ ⌘C 자체는 «만진 것» 이 아니다 — 수식키 조합(⌘·⌃)과 수식키 단독은 무장을 안 푼다(안 그러면 이 감시자가 ⌘C 를 먼저 받아 늘 풀어 버린다)
    const disarm = (e: Event) => { const ke = e as KeyboardEvent; if (e.type === 'keydown' && (ke.metaKey || ke.ctrlKey || ['Meta', 'Control', 'Alt', 'Shift'].includes(ke.key))) return; const t = e.target as HTMLElement | null; if (t?.closest?.('.col.doc')) armed.current = false }
    window.addEventListener('pointerdown', disarm, true); window.addEventListener('keydown', disarm, true)
    return () => { window.removeEventListener('pointerdown', disarm, true); window.removeEventListener('keydown', disarm, true) }
  }, [])
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'c' || !(e.metaKey || e.ctrlKey) || e.shiftKey) return
      const t = e.target as HTMLElement | null
      const rels = sel.size ? [...sel] : active ? [active] : []
      const editable = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      const verdict = copyIntent({ picked: rels.length, hasSelection: !!window.getSelection()?.toString(), inTree: !!t?.closest?.('.trow'), editable, inDoc: !!t?.closest?.('.col.doc'), armed: armed.current })
      if (verdict !== 'files') return
      e.preventDefault()
      if (e.altKey) { void copySay(rels.map((r) => `${bot.abs}/${r}`).join('\n'), say, '경로를 복사했어요'); return }
      void copyFiles(bot, rels, { main, hostName, phone: !!phone, say })
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [sel, active, bot, main, hostName, phone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = async (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (t?.closest?.('.col.doc')) return
      e.preventDefault()
      try {
        const list = await api<{ t: number; op: string; from: string; to: string }[]>('/undo')
        if (!list.length) { say('되돌릴 게 없어요'); return }
        await api('/undo', { body: { t: list[0].t } })
        say(`되돌렸어요 — ${list[0].from.split('/').pop()}`)
        refreshOpen()
      } catch (e2) { say((e2 as Error).message) }
    }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [exp, bot.id])
  useEffect(() => { if (!ctx) return; const off = () => setCtx(null); window.addEventListener('click', off); window.addEventListener('keydown', off); return () => { window.removeEventListener('click', off); window.removeEventListener('keydown', off) } }, [ctx])
  const [rows, refRows] = useMemo(() => {
    const q = filter?.trim() ?? ''
    const walk = (out: { n: Node; depth: number; root?: RefRoot }[], rel: string, depth: number) => {
      let list = dirs[rel] ?? []
      if (sort === 'mtime') list = [...list].sort((a, b) => (a.dir === b.dir ? b.mtime - a.mtime : a.dir ? -1 : 1))
      for (const n of list) {
        const hit = !q || scoreName(q, n.name, n.rel) > 0
        if (n.dir) { if (q ? true : true) { const before = out.length; if (exp.has(n.rel) || q) { out.push({ n, depth }); walk(out, n.rel, depth + 1); if (q && out.length === before + 1 && !hit) out.pop() } else out.push({ n, depth }) } }
        else if (hit) out.push({ n, depth })
      }
    }
    const own: { n: Node; depth: number }[] = []
    walk(own, '', 0)
    // 참조 폴더 — 같은 정렬·거르기·접기를 따른다(B안의 대가로 적은 그대로). 뿌리 줄은 거르기와 무관하게 늘 보인다
    const refs: { n: Node; depth: number; root?: RefRoot }[] = []
    for (const r of refRoots) {
      refs.push({ n: { name: r.name, rel: r.rel, dir: true, mtime: 0 } as Node, depth: 0, root: r })
      if (exp.has(r.rel) || q) walk(refs, r.rel, 1)
    }
    return [own, refs] as const
  }, [dirs, exp, sort, filter, refRoots])
  const vaultRel = (rel: string) => (bot.rel ? `${bot.rel}/${rel}` : rel)
  const toggleDir = (rel: string) => setExp((e) => { const n = new Set(e); if (n.has(rel)) n.delete(rel); else n.add(rel); return n })
  const rename = async (n: Node) => { const name = await askName(`${n.dir ? '폴더' : '파일'} 이름 바꾸기`, n.name); if (!name || name === n.name) return; try { const r = await api<{ rel: string }>(`/bots/${bot.id}/rename`, { body: { rel: n.rel, name } }); say(`→ ${r.rel}`); const parent = n.rel.includes('/') ? n.rel.slice(0, n.rel.lastIndexOf('/')) : ''; void loadDir(parent) } catch (e) { say((e as Error).message) } }
  return <>
    {/* 🔴 «파일» 제목 줄 = 맨 위(봇 폴더)로 옮길 자리 (10/18 Dave: 트리 밑의 «여기로 끌면 맨 위로» 띠는 트리를 펼치면 닿지 않았다) */}
    <button className={`sech ${dropOn === '' ? 'dover' : ''}`} onClick={tog}
      onDragOver={(e) => { if (!e.dataTransfer.types.includes('text/x-fb-rels')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropOn('') }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) return; setDropOn((x) => (x === '' ? null : x)) }}
      onDrop={(e) => { setDropOn(null); const raw = e.dataTransfer.getData('text/x-fb-rels'); if (!raw) return; e.preventDefault(); try { void moveTo(JSON.parse(raw) as string[], '') } catch { /* */ } }}><Icon n={open ? 'chevd' : 'chev'} size={9} /><span>파일</span>{dropOn === '' ? <span className="dhint">여기 놓으면 맨 위로</span> : null}
      <span className={`tools ${sort !== 'name' || filter !== null ? 'on' : ''}`} onClick={(e) => e.stopPropagation()}>
        <span style={{ position: 'relative' }}><span className={`ib ${sort !== 'name' ? 'on' : ''}`} title="정렬" onClick={() => setSortMenu(!sortMenu)}><Icon n="sort" size={12} /></span>{sortMenu ? <div className="menu" style={{ right: 0, top: 26 }} onClick={() => setSortMenu(false)}><div className="h">정렬</div><button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}><span style={{ flex: 1 }}>이름 (폴더 먼저)</span>{sort === 'name' ? <Icon n="check" size={11} /> : null}</button><button className={sort === 'mtime' ? 'on' : ''} onClick={() => setSort('mtime')}><span style={{ flex: 1 }}>수정순 — 최근 변경</span>{sort === 'mtime' ? <Icon n="check" size={11} /> : null}</button><hr /><button className={hidden ? 'on' : ''} onClick={() => setHidden(!hidden)}><span style={{ flex: 1 }}>숨김 파일 보기</span>{hidden ? <Icon n="check" size={11} /> : null}</button></div> : null}</span>
        <span className={`ib ${filter !== null ? 'on' : ''}`} title="이름으로 거르기" onClick={() => setFilter(filter === null ? '' : null)}><Icon n="search" size={12} /></span>
        <span className="ib" title="모두 접기" onClick={() => setExp(new Set(['']))}><Icon n="collapse" size={12} style={{ transform: 'rotate(90deg)' }} /></span>
        {bot.rel ? <span className="ib" title="참조 폴더 더하기 — 이 봇이 읽기만 하는 폴더" onClick={() => setPicking(true)}><Icon n="fplus" size={12} /></span> : null}
      </span></button>
    {open ? <>
      {filter !== null ? <div className="tfilter"><Icon n="search" size={12} /><input autoFocus placeholder="이름으로 거르기…" value={filter} onChange={(e) => setFilter(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setFilter(null) }} /><span onClick={() => setFilter(null)} style={{ cursor: 'pointer' }}><Icon n="x" size={11} /></span></div> : null}
      <div className="secb" style={{ padding: '0 6px 8px' }} onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-fb-rels')) edgeScroll(e.currentTarget, e.clientY) }}>
        {rows.map(({ n, depth }, ri) => <button key={n.rel} data-rel={n.rel} onPointerDown={() => { if (box && box !== n.rel) setBox('') }} className={`trow ${n.dir ? 'dir' : ''} ${active === n.rel ? 'on' : ''} ${sel.has(n.rel) ? 'sel' : ''} ${dropOn === n.rel ? 'dover' : ''} ${flash.has(n.rel) ? 'flash' : ''} ${box === n.rel ? 'box' : ''}`} style={{ ['--pad' as string]: `${10 + depth * 14}px` }}
          /**
           * ⌘/⌃ 하나씩 더하기 · ⇧ 사이 채우기 · 맨 클릭은 **열기**(고른 것은 풀린다).
           * ⚠ 「고르기」와 「열기」를 같은 클릭에 태우면 파일을 고를 때마다 문서가 열려 탭이 쌓인다.
           */
          onClick={(e) => {
            armed.current = true   // 트리를 만졌다 — 문서 창이 초점을 가져가도 다음 ⌘C 는 파일 복사(copyIntent)
            if (e.metaKey || e.ctrlKey) { setSel((p2) => { const x = new Set(p2); if (x.has(n.rel)) x.delete(n.rel); else x.add(n.rel); return x }); lastSel.current = n.rel; return }
            if (e.shiftKey && lastSel.current) {
              const a = rows.findIndex((r) => r.n.rel === lastSel.current)
              if (a >= 0) { const [lo, hi] = a < ri ? [a, ri] : [ri, a]; setSel(new Set(rows.slice(lo, hi + 1).map((r) => r.n.rel))); return }
            }
            setSel(new Set()); lastSel.current = n.rel
            if (n.dir) toggleDir(n.rel); else onOpen(n.rel)
          }}
          onDoubleClick={() => { if (!n.dir) onOpen(n.rel, true) }}
          onContextMenu={(e) => { e.preventDefault(); if (!sel.has(n.rel)) setSel(new Set()); setCtx({ x: e.clientX, y: e.clientY, n }) }} title={n.rel}
          draggable
          onDragStart={(e) => {
            // 고른 것 안을 끌면 **고른 것 전부**가 따라온다 — 하나만 가면 «내가 고른 건 뭐였지» 가 된다
            const rels = targets(n)
            e.dataTransfer.setData('text/x-fb-rel', n.rel)
            e.dataTransfer.setData('text/x-fb-rels', JSON.stringify(rels))
            e.dataTransfer.setData('text/x-fb-dir', n.dir ? '1' : '0')
            e.dataTransfer.setData('text/plain', rels.map((r) => `${bot.abs}/${r}`).join('\n'))
          }}
          /* 파일 줄에 놓으면 **그 파일이 든 폴더**로 — Finder 와 같다. 밝아지는 것도 그 폴더 줄(맨 위면 «파일» 제목 줄)이다 */
          onDragOver={(e) => { if (!e.dataTransfer.types.includes('text/x-fb-rels')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropOn(dropDir(n)) }}
          onDragLeave={() => setDropOn((x) => (x === dropDir(n) ? null : x))}
          onDrop={(e) => {
            setDropOn(null)
            const raw = e.dataTransfer.getData('text/x-fb-rels')
            if (!raw) return
            e.preventDefault(); e.stopPropagation()
            try { void moveTo(JSON.parse(raw) as string[], dropDir(n)) } catch { /* */ }
          }}>
          <span className="cv">{n.dir ? <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={9} /> : null}</span><Icon n={n.dir ? 'folder' : 'doc'} size={12} color={n.dir && exp.has(n.rel) ? 'var(--wait)' : 'var(--t3)'} /><span className="n"><Mid s={n.name} /></span>{n.botId ? <span className="dot run" title="봇 있음" style={{ width: 5, height: 5 }} /> : null}<time>{flash.has(n.rel) ? '방금' : fmtTime(n.mtime)}</time>
        </button>)}
        {!rows.length ? <div className="kv" style={{ color: 'var(--t3)' }}>{dirs[''] ? '비어 있어요' : <><div className="skel" style={{ width: '70%' }} /></>}</div> : null}
        {bot.rel ? <>
          <div className="trefsep" />
          {refRows.map(({ n, depth, root }) => root
            ? <button key={n.rel} className={`trow dir tref ${exp.has(n.rel) ? 'open' : ''}`} style={{ ['--pad' as string]: '10px' }} onClick={() => toggleDir(n.rel)} title={`참조 폴더 · ${root.vrel}`}
                onContextMenu={(e) => { e.preventDefault(); setRefMenu({ x: e.clientX, y: e.clientY, r: root }) }}>
                <span className="cv"><Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={9} /></span><Icon n="folder" size={12} color="var(--t2)" /><span className="n"><Mid s={n.name} /></span>
                <span className="trefro">읽기만</span>
                <span className="trefmore" title="참조 폴더 메뉴" onClick={(e) => { e.stopPropagation(); setRefMenu({ x: e.clientX, y: e.clientY, r: root }) }}><Icon n="more" size={12} /></span>
              </button>
            : <button key={n.rel} className={`trow trefin ${n.dir ? 'dir' : ''} ${active === n.rel ? 'on' : ''}`} style={{ ['--pad' as string]: `${10 + depth * 14}px` }} title={n.rel.replace(/^(\.\.\/)+/, '')}
                onClick={() => { if (n.dir) toggleDir(n.rel); else onOpen(n.rel) }}>
                <span className="cv">{n.dir ? <Icon n={exp.has(n.rel) ? 'chevd' : 'chev'} size={9} /> : null}</span><Icon n={n.dir ? 'folder' : 'doc'} size={12} color="var(--t3)" /><span className="n"><Mid s={n.name} /></span>
              </button>)}
          <button className="trow trefadd" style={{ ['--pad' as string]: '10px' }} onClick={() => setPicking(true)}><span className="cv" /><Icon n="fplus" size={12} color="var(--t3)" /><span className="n">참조 폴더 더하기</span></button>
        </> : null}
      </div>
    </> : null}
    {refMenu ? <Float at={{ x: refMenu.x, y: refMenu.y }} onClose={() => setRefMenu(null)} className="menu ctx">
      <div className="h">참조 · {refMenu.r.vrel}</div>
      <button onClick={() => { void openOnThisDevice(bot, refMenu.r.rel, 'reveal', { main, hostName, phone: !!phone, say }); setRefMenu(null) }}><span style={{ flex: 1 }}>Finder 에서 보기</span></button>
      <button onClick={() => { onStartAt(refMenu.r.vrel); setRefMenu(null) }}><span style={{ flex: 1 }}>여기서 봇 시작</span></button>
      <hr />
      <button className="warn" onClick={() => { void removeRef(refMenu.r); setRefMenu(null) }}><span style={{ flex: 1 }}>참조에서 빼기</span></button>
    </Float> : null}
    {picking ? <FolderPicker onClose={() => setPicking(false)} onStarted={() => setPicking(false)}
      pick={{ title: '참조 폴더로 더할 폴더를 고르세요', sub: `이 봇이 읽기만 하는 폴더예요 — 작업 폴더는 그대로 · 최대 5개 · 지금 ${refRoots.length}개`, go: '참조 폴더로 더하기', onPick: addRef }} /> : null}
    {ctx ? <Float at={{ x: ctx.x, y: ctx.y }} onClose={() => setCtx(null)} className="menu ctx">
      {/* ⚠ 여럿을 고른 채 우클릭했으면 **몇 개를 다루는지** 를 먼저 말한다 — 되돌리기 어려운 항목이 아래 있다 */}
      {sel.has(ctx.n.rel) && sel.size > 1 ? <div className="h">{sel.size}개 고름</div> : null}
      {sel.has(ctx.n.rel) && sel.size > 1 ? null : !ctx.n.dir ? <><button onClick={() => onOpen(ctx.n.rel, true)}><span style={{ flex: 1 }}>열기 (고정 탭)</span><span className="k">⏎</span></button><button onClick={() => onAttach(ctx.n.rel)}><span style={{ flex: 1 }}>첨부로 보내기</span></button><button onClick={() => onMention(ctx.n.rel)}><span style={{ flex: 1 }}>@ 로 언급하기</span><span className="k">@</span></button></>
        : <>{ctx.n.botId ? <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel), ctx.n.botId)}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>봇 열기</span><span className="k">⏎</span></button> : <button className="on" onClick={() => onStartAt(vaultRel(ctx.n.rel))}><Icon n="sub" size={12} /><span style={{ flex: 1 }}>{bot.orchestrator ? '여기서 에이전트 시작' : '이 하위 폴더로 새 봇 시작'}</span><span className="k">⏎</span></button>}<button onClick={() => onNewFolderAt(vaultRel(ctx.n.rel))}><Icon n="fplus" size={12} /><span style={{ flex: 1 }}>새 폴더 만들기 → 시작</span></button><hr /><button onClick={() => toggleDir(ctx.n.rel)}><span style={{ flex: 1 }}>{exp.has(ctx.n.rel) ? '접기' : '펼치기'}</span></button><button onClick={() => onAttach(ctx.n.rel, true)}><span style={{ flex: 1 }}>폴더째 첨부</span></button></>}
      {/* 이미지는 **그림 그대로** 클립보드에 — 붙여넣기로 슬랙·문서에 바로 들어간다 */}
      {!ctx.n.dir && IMG_RE.test(ctx.n.rel) ? <button onClick={() => void copyImage(ctx.n.rel)}><span style={{ flex: 1 }}>이미지 복사</span></button> : null}
      {/* M-3 · 파일 자체를 복사 — Finder ⌘V·카톡 첨부. 원격은 캐시로 받은 사본(진행·취소), 폰은 공유 시트 */}
      <button onClick={() => { const rels = sel.has(ctx.n.rel) && sel.size > 1 ? [...sel] : [ctx.n.rel]; void copyFiles(bot, rels, { main, hostName, phone: !!phone, say }) }}><Icon n="copy" size={12} /><span style={{ flex: 1 }}>{phone ? '공유…' : `${ctx.n.dir ? '폴더' : '파일'} 복사${sel.has(ctx.n.rel) && sel.size > 1 ? ` (${sel.size}개)` : ''}`}</span><span className="k">{phone ? '' : '⌘C'}</span></button>
      <button onClick={() => { void copySay(`${bot.abs}/${ctx.n.rel}`, say, '경로를 복사했어요') }}><span style={{ flex: 1 }}>경로 복사</span><span className="k">⌥⌘C</span></button>
      <button onClick={() => { void copySay(ctx.n.rel, say, '상대 경로를 복사했어요') }}><span style={{ flex: 1 }}>경로 복사 (폴더 기준)</span></button>
      {sel.has(ctx.n.rel) && sel.size > 1 ? null : <button onClick={() => rename(ctx.n)}><span style={{ flex: 1 }}>이름 바꾸기</span></button>}
      <button onClick={() => void dup(ctx.n)}><span style={{ flex: 1 }}>복제</span></button>
      {/* 🔴 **지우지 않고 옮긴다** — 볼트 안 `.folderbot/trash/` 로. ⌘Z 로 돌아온다 */}
      <button className="warn" onClick={() => void toTrash(ctx.n)}><Icon n="x" size={12} /><span style={{ flex: 1 }}>휴지통으로{sel.has(ctx.n.rel) && sel.size > 1 ? ` (${sel.size}개)` : ''}</span><span className="k">⌫</span></button>
      {/**
        * ⚠ 「열기」와 다른 일이다 — 파일을 여는 게 아니라 **어디 있는지** 보여 준다.
        * 🔴 **원격에서도 보인다** (2026-09-14 Dave: «폴더에서 우클릭 메뉴에 finder에서 보기가 없네»).
        *    종전에는 메인(호스트 맥)에서만 그렸다 — 원격 맥에서 보던 Dave 에게는 **없는 기능**으로 보였다.
        *    여는 주체는 언제나 호스트이므로, 원격에서는 이름을 「메인 맥에서 Finder 로」 로 바꿔
        *    **어디서 열리는지**를 먼저 말한다(문서 도구줄의 「메인 맥에서 열기」와 같은 규칙).
        * ⛔ 숨기지 마라 — 안 보이면 «이 앱엔 없는 기능» 이 되고, 그건 있는 기능을 잃는 것이다.
        */}
      <button onClick={() => void reveal(ctx.n)}><span style={{ flex: 1 }}>Finder 에서 보기</span>{main ? null : <span className="k">{localBridge() ? '이 기기' : phone ? '맥에서만' : '내려받기'}</span>}</button>
      <hr />
      <button onClick={() => void makeNew(ctx.n, 'note')}><Icon n="doc" size={12} /><span style={{ flex: 1 }}>새 노트</span></button>
      <button onClick={() => void makeNew(ctx.n, 'folder')}><Icon n="folder" size={12} /><span style={{ flex: 1 }}>새 폴더</span></button>
      <hr /><button onClick={() => setExp(new Set(['']))}><span style={{ flex: 1 }}>모두 접기</span></button>
    </Float> : null}
  </>
}

export function BotGlyph({ bot, size = 16, working = false }: { bot: Bot; size?: number; working?: boolean }) { return <FolderBot color={bot.color} size={size} mood={working ? 'work' : 'idle'} mono /> }
export const useTick = (ms = 1000) => { const [, set] = useState(0); const r = useRef(0); useEffect(() => { const t = window.setInterval(() => set(++r.current), ms); return () => window.clearInterval(t) }, [ms]) }
