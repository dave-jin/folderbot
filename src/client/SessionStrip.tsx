import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bot, SessionInfo } from '../core/types'
import { api } from './api'
import { sessionUnread } from '../core/unread'
import { autoKind, sessArea } from '../core/autoArea'
import { askBadge, askLabel, askLifted } from '../core/askMark'
import { askOpened, useAskNow, useAskPrefs } from './askUi'
import { Icon } from './FolderBot'
import { deleteSession, type Say } from './Sheets'
import { startSession } from './newSession'
import { refreshModels } from './consts'
import { Mark, VendorMark, useProviders } from './Brand'
import { Float, anchorOf, type Anchor } from './Float'
import { PROVIDER_LABEL, type ProviderId } from '../core/agents'
import { fmtElapsed, fmtTime, useStore } from './store'
import { fitTabs, hiddenDot, type StripDot } from '../core/stripFit'
import { useEsc } from './esc'

/**
 * 세션 줄 (2026-11-13 Dave 카드 — 가안 «가운데는 대화, 오른쪽은 폴더» · 넘칠 때는 «가 — ＋N 목록»).
 *
 * 세션은 채팅 머리줄 아래 한 줄로 선다. 종전에는 오른쪽 패널의 «세션» 절이었다(9/24 «세션 리스트는 할 일 위에» — 11/12 가안을
 * 고르며 뒤집었다). 이 파일이 세션을 다루는 일(새 세션 · 이름 고치기 · 지우기 · 묻는 세션 올리기 · 채팅/자동화 가르기)의 한 자리다.
 *
 * - 데스크톱: `SessionStrip` — 탭 줄. 다 안 들어가면 들어가는 만큼만 세우고 나머지는 «＋N» 단추의 목록(`core/stripFit`).
 * - 폰: 줄을 세우지 않는다. 채팅 머리줄의 단추가 `SessionSheet`(바닥 시트)를 연다.
 * - 목록의 줄(`SessionRows`)은 두 자리가 같이 쓴다.
 *
 * 지킨 결정 — 자동화 세션은 따로 접어 둔다(10/12 «내가 가급적 사용하지 않도록») · 묻는 중인 바깥 세션은 맨 앞으로(10/25) ·
 * 세션 이름 오른쪽의 회사 표식(9/13) · 이름은 그 자리에서 고친다(9/15) · 지우면 묻지 않고 10초 되돌리기(11/13) ·
 * 에이전트가 둘 이상이면 새 세션 때 고른다(하나면 묻지 않는다).
 */
type Go = (botId: string, sid?: string) => void
type Dot = 'run' | 'wait' | 'err' | 'unread' | 'none'
const dotOf = (x: SessionInfo): Dot => (x.state === 'running' ? 'run' : x.state === 'awaiting_input' ? 'wait' : x.state === 'error' ? 'err' : sessionUnread(x.lastReplyAt, x.readAt) ? 'unread' : 'none')
const stripDot = (d: Dot): StripDot => (d === 'wait' || d === 'run' || d === 'unread' ? d : '')

function Ticking({ from }: { from?: number }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])
  return <>{fmtElapsed(from)}</>
}

export function useSessionOps(bot: Bot, sessions: SessionInfo[], sessionId: string | undefined, go: Go, say: Say) {
  const { s, dispatch } = useStore()
  const provs = useProviders()
  const [pick, setPick] = useState<Anchor | null>(null)
  const [ap] = useAskPrefs()
  const askNow = useAskNow(sessions.some((x) => x.asks?.length))
  const lifted = ap.lift ? askLifted(sessions, askNow) : []
  const liftedIds = new Set(lifted.map((x) => x.s.id))
  const chat = sessions.filter((x) => sessArea(x) === 'chat' && !liftedIds.has(x.id))
  const auto = sessions.filter((x) => sessArea(x) === 'auto' && !liftedIds.has(x.id))
  const askHl = ap.expand ? new Set(auto.filter((x) => askBadge(x, askNow)?.state === 'asking').map((x) => x.id)) : new Set<string>()
  const newSession = (vendor?: ProviderId) => {
    setPick(null)
    // 누르는 순간 그 세션으로 간다 — 만들기는 뒤에서, 실패하면 되돌리고 알린다(`newSession.ts`)
    startSession({ bot, name: `세션 ${sessions.filter((x) => sessArea(x) === 'chat').length + 1}`, vendor: vendor ?? provs[0]?.id, defaults: s.defaults, dispatch, go, prev: sessionId, say, after: () => void refreshModels() })
  }
  /** 새 세션 단추 — 에이전트가 둘 이상이면 고르게 하고, 하나면 바로 만든다 */
  const askNew = (el: HTMLElement) => { if (provs.length > 1) setPick(anchorOf(el)); else newSession() }
  const [ren, setRen] = useState<{ id: string; v: string } | null>(null)
  const saveRen = async () => {
    const r = ren; if (!r) return
    setRen(null)
    const name = r.v.trim()
    const was = sessions.find((x) => x.id === r.id)
    if (!name || !was || name === was.name) return
    try { await api(`/sessions/${r.id}/rename`, { body: { name } }) } catch (e) { say((e as Error).message) }
  }
  /** 지우기 — 묻지 않고 지운 뒤 10초 되돌리기(`deleteSession`). 지운 게 지금 보는 세션이면 남은 첫 세션으로 간다 */
  const del = async (x: SessionInfo) => {
    const wasCur = x.id === sessionId
    try {
      await deleteSession(x, say, () => { const left = sessions.filter((y) => y.id !== x.id && sessArea(y) === 'chat'); if (wasCur) go(bot.id, left[0]?.id) }, () => { if (wasCur) go(bot.id, x.id) })
    } catch (e) { say((e as Error).message) }
  }
  const pickEl = pick ? <Float at={pick} onClose={() => setPick(null)}>{provs.map((pv) => <button key={pv.id} onClick={() => newSession(pv.id)}><Mark id={pv.id} size={14} /><span>{PROVIDER_LABEL[pv.id]}</span></button>)}<hr /><button onClick={() => setPick(null)}><span>취소</span></button></Float> : null
  return { provs, lifted, chat, auto, askHl, askNow, newSession, askNew, ren, setRen, saveRen, del, pickEl }
}
type Ops = ReturnType<typeof useSessionOps>
type Lift = Ops['lifted'][number]

const renInput = (ops: Ops) => <input autoFocus className="rin" value={ops.ren?.v ?? ''} onChange={(e) => ops.setRen({ id: ops.ren!.id, v: e.target.value })}
  onFocus={(e) => e.currentTarget.select()} onBlur={() => void ops.saveRen()} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}
  onKeyDown={(e) => { if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); void ops.saveRen() } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); ops.setRen(null) } }} />

/**
 * 목록의 줄 — «＋N» 목록과 폰 시트가 같이 쓴다. 종전 오른쪽 패널의 세션 줄과 같은 모양(`.srow`)이다.
 * `autoOpen` 을 주면 끝에 접히는 «자동화» 묶음을 세운다.
 */
export function SessionRows({ bot, ops, rows, lifts = [], sessionId, go, onPicked, withAuto, withNew }: { bot: Bot; ops: Ops; rows: SessionInfo[]; lifts?: Lift[]; sessionId?: string; go: Go; onPicked?: () => void; withAuto?: boolean; withNew?: boolean }) {
  const { auto, askHl, askNow } = ops
  const pickS = (id: string) => { go(bot.id, id); onPicked?.() }
  // 지금 보는 세션이 자동화거나 그 안에 묻는 세션이 있으면 펼쳐 보인다 — 머리 줄을 누르면 그 묶음을 보는 동안은 접힌다
  const [open, setOpen] = useState<boolean>(() => { try { return localStorage.getItem(`fb:sauto:${bot.id}`) === '1' } catch { return false } })
  useEffect(() => { try { setOpen(localStorage.getItem(`fb:sauto:${bot.id}`) === '1') } catch { setOpen(false) } }, [bot.id])
  const viewingAuto = auto.some((x) => x.id === sessionId)
  const forced = viewingAuto || askHl.size > 0
  const shutKey = `${viewingAuto ? sessionId : ''}|${[...askHl].join(',')}`
  const [shut, setShut] = useState<string | null>(null)
  const autoOpen = open || (forced && shut !== shutKey)
  const togAuto = () => { const next = !autoOpen; setOpen(next); try { localStorage.setItem(`fb:sauto:${bot.id}`, next ? '1' : '0') } catch { /* 저장 못 해도 화면은 바뀐다 */ } setShut(next ? null : forced ? shutKey : null) }
  const autoDot = auto.some((x) => x.state === 'awaiting_input') ? 'wait' : auto.some((x) => x.state === 'running') ? 'run' : ''
  const liftRow = ({ s: x, b }: Lift) => <button key={x.id} data-sid={x.id} className={`srow asklift ${b.state} ${x.id === sessionId ? 'on' : ''}`} onClick={() => { if (b.state === 'answered') askOpened(x.id); pickS(x.id) }}><span className={`dot ${b.state === 'asking' ? (x.state === 'awaiting_input' ? 'wait' : 'run') : b.err ? 'err' : 'unread'}`} style={{ marginTop: 6 }} /><span className="n">{askLabel(b, askNow)}<small>{x.name}</small></span><span className="m">{fmtTime(b.state === 'asking' ? b.at : b.doneAt ?? b.at)}</span></button>
  const row = (x: SessionInfo) => ops.ren?.id === x.id
    ? <div key={x.id} className="srow edit"><span className="dot none" />{renInput(ops)}</div>
    : <button key={x.id} data-sid={x.id} className={`srow ${x.id === sessionId ? 'on' : ''} ${sessionUnread(x.lastReplyAt, x.readAt) ? 'unread' : ''} ${autoKind(x) ? 'auto' : ''} ${askHl.has(x.id) ? 'askhl' : ''}`} onClick={() => pickS(x.id)} onDoubleClick={(e) => { e.stopPropagation(); ops.setRen({ id: x.id, v: x.name }) }}><span className={`dot ${dotOf(x)}`} /><span className="n">{x.name}</span>{autoKind(x) ? <span className="ak">{autoKind(x)}</span> : null}<VendorMark vendor={x.vendor} size={11} /><span className="m">{x.state === 'running' ? <Ticking from={x.turnStartedAt} /> : x.hibernated ? '절전' : fmtTime(x.lastActivity)}</span><span className="ib ren" title="이름 바꾸기 (두 번 누르기)" onClick={(e) => { e.stopPropagation(); ops.setRen({ id: x.id, v: x.name }) }}><Icon n="edit" size={11} /></span><span className="ib del" title="세션 지우기" onClick={(e) => { e.stopPropagation(); void ops.del(x) }}><Icon n="x" size={11} /></span></button>
  return <>
    {lifts.map(liftRow)}{rows.map(row)}
    {withNew ? <button className="srow sadd" onClick={(e) => { ops.askNew(e.currentTarget as HTMLElement); if (ops.provs.length <= 1) onPicked?.() }}><Icon n="plus" size={11} color="var(--t3)" /><span className="n">새 세션</span></button> : null}
    {withAuto && auto.length ? <>{rows.length || lifts.length || withNew ? <hr className="shr" /> : null}<button className="srow autoh" onClick={togAuto} aria-expanded={autoOpen} title="소통·연결 채널·루틴처럼 봇이 스스로 쓰는 세션 — 오래된 것은 저절로 정리돼요"><Icon n={autoOpen ? 'chevd' : 'chev'} size={9} color="var(--t3)" /><span className="n">자동화</span>{autoDot ? <span className={`dot ${autoDot}`} /> : null}<span className="m">{auto.length}</span></button>{autoOpen ? auto.map(row) : null}</> : null}
  </>
}

interface Tab { x: SessionInfo; lift?: Lift }
const GAP = 2

/** 데스크톱 · 채팅 머리줄 아래의 세션 줄 */
export function SessionStrip({ bot, sessions, sessionId, go, say }: { bot: Bot; sessions: SessionInfo[]; sessionId?: string; go: Go; say: Say }) {
  const ops = useSessionOps(bot, sessions, sessionId, go, say)
  const { lifted, chat, auto, askNow } = ops
  const tabs: Tab[] = [...lifted.map((l) => ({ x: l.s, lift: l })), ...chat.map((x) => ({ x }))]
  const wrap = useRef<HTMLDivElement>(null); const meas = useRef<HTMLDivElement>(null)
  const [vis, setVis] = useState<number[] | null>(null)
  const active = tabs.findIndex((t) => t.x.id === sessionId)
  const calcRef = useRef<() => void>(() => undefined)
  calcRef.current = () => {
    const el = wrap.current, m = meas.current; if (!el || !m) return
    const ws = [...m.querySelectorAll<HTMLElement>('.stab')].map((e) => Math.ceil(e.getBoundingClientRect().width) + GAP)
    const wOf = (q: string) => Math.ceil((m.querySelector(q) as HTMLElement | null)?.getBoundingClientRect().width ?? 0) + 6
    const cs = getComputedStyle(el); const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    const plusW = wOf('.splus')
    // 자동화 세션이 있으면 오른쪽 끝 단추는 늘 선다 — 그 자리는 미리 빼 두고, 없으면 넘칠 때만 «＋N» 자리를 쓴다
    const reserved = auto.length ? Math.max(wOf('.smore.m-more'), wOf('.smore.m-auto')) : 0
    const next = fitTabs(ws, el.clientWidth - pad - plusW - reserved, auto.length ? 0 : wOf('.smore.m-more'), active)
    setVis((prev) => (prev && prev.length === next.length && prev.every((v, i) => v === next[i]) ? prev : next))
  }
  // 채팅 칸 폭 · 탭의 내용(이름 · 점 · 경과)이 바뀌면 다시 가른다. 글꼴이 늦게 뜨면 폭이 달라지므로 한 번 더 잰다
  useLayoutEffect(() => {
    const el = wrap.current, m = meas.current; if (!el || !m) return
    const run = () => calcRef.current()
    run()
    const ro = new ResizeObserver(run); ro.observe(el); ro.observe(m)
    void document.fonts?.ready.then(run)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => { calcRef.current() }, [tabs.map((t) => t.x.id).join(','), active, auto.length])   // eslint-disable-line react-hooks/exhaustive-deps

  const [menu, setMenu] = useState<Anchor | null>(null); const menuDown = useRef(false)
  const shown = vis ?? tabs.map((_, i) => i)
  const hidden = tabs.filter((_, i) => !shown.includes(i))
  const hd = hiddenDot([...hidden.map((t) => stripDot(dotOf(t.x))), ...auto.map((x) => { const d = dotOf(x); return d === 'wait' || d === 'run' ? d : '' as StripDot })])
  useEffect(() => { if (menu && !hidden.length && !auto.length) setMenu(null) }, [menu, hidden.length, auto.length])

  const tabEl = (t: Tab, measure = false) => {
    const { x, lift } = t
    if (!measure && ops.ren?.id === x.id) return <div key={x.id} className="stab edit">{renInput(ops)}</div>
    const d: Dot = lift ? (lift.b.state === 'asking' ? (x.state === 'awaiting_input' ? 'wait' : 'run') : lift.b.err ? 'err' : 'unread') : dotOf(x)
    return <button key={x.id} data-sid={measure ? undefined : x.id} tabIndex={measure ? -1 : undefined} className={`stab ${x.id === sessionId ? 'on' : ''} ${d === 'unread' ? 'unread' : ''} ${lift ? `asklift ${lift.b.state}` : ''}`} title={lift ? `${askLabel(lift.b, askNow)} · ${x.name}` : x.name}
      onClick={measure ? undefined : () => { if (lift?.b.state === 'answered') askOpened(x.id); go(bot.id, x.id) }} onDoubleClick={measure ? undefined : (e) => { e.stopPropagation(); ops.setRen({ id: x.id, v: x.name }) }}>
      {d !== 'none' ? <span className={`dot ${d}`} /> : null}<span className="n">{lift ? askLabel(lift.b, askNow) : x.name}</span><VendorMark vendor={x.vendor} size={11} />{x.state === 'running' ? <span className="m"><Ticking from={x.turnStartedAt} /></span> : null}
      {measure ? null : <span className="ib del" title="세션 지우기" onClick={(e) => { e.stopPropagation(); void ops.del(x) }}><Icon n="x" size={10} /></span>}
    </button>
  }
  const moreLabel = (n: number) => (n ? `＋${n}` : `자동화 ${auto.length}`)
  return <div className="sstrip" ref={wrap} role="tablist" aria-label="세션">
    {tabs.length ? shown.map((i) => tabs[i]).filter(Boolean).map((t) => tabEl(t))
      : <button className="stab sempty" onClick={(e) => ops.askNew(e.currentTarget as HTMLElement)}><Icon n="plus" size={11} /><span className="n">{ops.provs.length > 1 ? 'Claude 나 ChatGPT 로 시작' : '세션 시작'}</span></button>}
    {tabs.length ? <button className="splus" title="새 세션 (⌘N)" aria-label="새 세션" onClick={(e) => ops.askNew(e.currentTarget as HTMLElement)}><Icon n="plus" size={12} /></button> : null}
    <span className="gap" />
    {hidden.length || auto.length ? <button className={`smore ${menu ? 'on' : ''} ${hidden.length ? 'more' : 'auto'}`} aria-expanded={!!menu} aria-haspopup="menu" title={hidden.length ? `가려진 세션 ${hidden.length}개` : '자동화 세션'}
      onMouseDown={() => { menuDown.current = !!menu }} onClick={(e) => { const was = e.detail === 0 ? !!menu : menuDown.current; setMenu(was ? null : anchorOf(e.currentTarget, { right: true, gap: 6 })) }}>
      <span>{moreLabel(hidden.length)}</span>{hd ? <span className={`dot ${hd}`} /> : null}<Icon n="chevd" size={9} /></button> : null}
    {menu ? <Float at={menu} onClose={() => setMenu(null)} className="spop sessm" width={268}><SessionRows bot={bot} ops={ops} rows={hidden.filter((t) => !t.lift).map((t) => t.x)} lifts={hidden.filter((t) => t.lift).map((t) => t.lift as Lift)} sessionId={sessionId} go={go} onPicked={() => setMenu(null)} withAuto /></Float> : null}
    {ops.pickEl}
    {/* 폭을 재는 줄 — 보이지 않고 자리도 차지하지 않는다(가로 넘침을 만들면 폭 검사가 빨강이다) */}
    <div className="smeas" aria-hidden="true"><div ref={meas}>{tabs.map((t) => tabEl(t, true))}<span className="splus"><Icon n="plus" size={12} /></span><span className="smore m-more"><span>＋99</span><span className="dot run" /><Icon n="chevd" size={9} /></span><span className="smore m-auto"><span>자동화 {auto.length}</span><span className="dot run" /><Icon n="chevd" size={9} /></span></div></div>
  </div>
}

/** 폰 · 채팅 머리줄의 단추가 여는 세션 목록(바닥 시트) */
export function SessionSheet({ bot, sessions, sessionId, go, say, onClose }: { bot: Bot; sessions: SessionInfo[]; sessionId?: string; go: Go; say: Say; onClose: () => void }) {
  // 세션을 고르거나 새로 만들면 시트는 닫힌다(에이전트를 고른 뒤에 만드는 길 포함)
  const ops = useSessionOps(bot, sessions, sessionId, (b, sid) => { go(b, sid); onClose() }, say)
  useEsc(onClose)
  return <>
    <div className="backdrop" onClick={onClose} />
    <div className="tsheet sesssheet" role="dialog" aria-modal="true" aria-label="세션">
      <div className="grip" />
      <div className="ssh"><b>세션</b><span className="c">{ops.chat.length + ops.lifted.length}</span><button className="ib mx" onClick={onClose} title="닫기" aria-label="닫기"><Icon n="x" size={14} /></button></div>
      <div className="ssb"><SessionRows bot={bot} ops={ops} rows={ops.chat} lifts={ops.lifted} sessionId={sessionId} go={go} onPicked={onClose} withAuto /></div>
      {/* 새 세션은 목록 밖 발에 둔다 — 세션이 많아 목록이 밀려도 늘 보인다 */}
      <div className="ssf"><button className="srow sadd" onClick={(e) => { ops.askNew(e.currentTarget as HTMLElement); if (ops.provs.length <= 1) onClose() }}><Icon n="plus" size={12} color="var(--t2)" /><span className="n">새 세션</span></button></div>
      {ops.pickEl}
    </div>
  </>
}
