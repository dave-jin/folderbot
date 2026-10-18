import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { LetterView, PeerView, PresetId } from '../core/bridgeView'
import { PRESETS, agoText, defaultMailbox, freeId, newBridgeProblems, peerColor, peerMood, presetOf } from '../core/bridgeView'
import type { Trust } from '../core/bridges'

/** 사람이 직접 쓴 편지의 from — `host/bridge.ts` 의 HUMAN_FROM */
const HUMAN = 'human'
import { api } from './api'
import { copySay } from './clip'
import { FolderBot, Icon } from './FolderBot'
import { ICON_PX, useIconSize } from './theme'
import { fmtTime, useStore } from './store'
import { Md } from './Sheets'

/**
 * 연결(Bridge) 화면 (BQ-9 · BQ-10 · 2026-10-19 Dave «A·A» — 목업 `03_디자인/2026-10-09_연결-목업` ①A · ②A).
 *  - 레일 «연결» 절(`BridgeRail`) — 관제 아래, 상대가 봇 줄과 같은 꼴로 선다. 오른쪽에 안 읽은 편지 수 · 끊김.
 *    ⚠ 봇 줄(`.brow`)을 다시 쓰지 않는다 — 검사·끌어 놓기·정렬이 `.brow` 를 센다. 꼴만 맞춘 `.brg-row` 다.
 *  - 편지 스레드(`BridgeThread`) — 채널 세션(생각·도구 줄)과 따로 **오간 편지만** 시간순. 배달·읽음 표시 · 사람이 직접 편지 쓰기.
 *  - 새 연결 마법사(`BridgesPane`) — 설정 › 연결. ① 종류 → ② 자리·권한 → ③ 만들기(우편함 폴더·README·설정 한 줄 · 상대에게 줄 한 줄).
 * 데이터는 호스트가 만든 꼴(`core/bridgeView`)을 받아 그리기만 한다. 다시 읽는 때: `bridges` 프레임 · 다시 붙음(hello) · 30초마다.
 */

interface BridgesResp { peers: PeerView[]; errors: string[]; taken: { ids: string[]; mailboxes: string[] }; host: string; port: number }
/** 레일·스레드·설정이 같은 목록 하나를 본다 — 요청도 하나 */
let cache: BridgesResp | null = null
let inflight: Promise<void> | null = null
const subs = new Set<() => void>()
let poll: number | undefined
function loadBridges(): Promise<void> {
  if (inflight) return inflight
  inflight = api<BridgesResp>('/bridges').then((r) => { cache = r; subs.forEach((f) => f()) }).catch(() => { /* 다음 신호에 다시 */ }).finally(() => { inflight = null })
  return inflight
}
if (typeof window !== 'undefined') window.addEventListener('fb:bridges', () => { if (subs.size) void loadBridges() })
export function useBridges(): BridgesResp | null {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    subs.add(force)
    if (!cache) void loadBridges()
    if (poll === undefined) poll = window.setInterval(() => { if (subs.size && document.visibilityState === 'visible') void loadBridges() }, 30_000)
    return () => { subs.delete(force); if (!subs.size && poll !== undefined) { window.clearInterval(poll); poll = undefined } }
  }, [])
  return cache
}
export const reloadBridges = loadBridges

/**
 * 상대 아이콘 — 봇과 같은 얼굴·배지에 몸만 말풍선(2026-10-19 Dave «B 말풍선»). 상태는 얼굴과 배지가 말한다(`peerMood`).
 * 안 읽은 편지는 봇처럼 배지 링 — 숫자 알약은 버렸다. 레일·머리줄은 봇처럼 흑백 얼굴(mono)
 */
function PeerIcon({ p, size = 24, mono = true }: { p: PeerView; size?: number; mono?: boolean }) {
  return <FolderBot shape="bubble" color={p.color} size={size} mood={peerMood(p)} unread={p.unread > 0} mono={mono} />
}
/** 머리줄 보조 글 — 개발자 말(trust · 커서 · 우편함 경로) 대신 사람 말. 자세한 값은 이름에 마우스를 올리면 */
const peerLine = (p: PeerView) => p.stale ? `신호가 끊겼어요${p.lastSignal ? ` · ${agoText(p.lastSignal)} 전에 마지막으로 다녀갔어요` : ''}`
  : p.lastSignal ? (agoText(p.lastSignal) === '방금' ? '방금 다녀갔어요' : `${agoText(p.lastSignal)} 전에 다녀갔어요`) : '아직 다녀가지 않았어요'
const peerTitle = (p: PeerView) => `${p.name} · 우편함 ${p.mailbox} · 권한 ${p.trust}${p.host ? ` · ${p.host} 가 받음` : ''}${p.lastSignal ? ` · 마지막 신호 ${new Date(p.lastSignal).toLocaleString('ko-KR')}` : ''}`

/** 레일 «연결» 절 — 상대가 없으면 절 자체를 안 그린다 */
export function BridgeRail({ active, onOpen, phone }: { active?: string; onOpen: (p: PeerView) => void; phone?: boolean }) {
  const b = useBridges()
  const [iconSz] = useIconSize() // 봇 줄과 같은 크기(설정 › 레일 아이콘)
  if (!b?.peers.length) return null
  return <div className="brg-sec" data-sec="연결">
    <div className="secl">연결</div>
    {b.peers.map((p) => {
      // 봇 줄과 같은 꼴 — 이름 · 오른쪽에 마지막 편지 시각. 끊김·다른 맥만 이름 뒤 흐린 글로(상태는 얼굴이 이미 말한다)
      const sub = p.stale ? '끊김' : !p.owner && p.host ? `${p.host} 가 받음` : ''
      return <button key={p.id} data-peer={p.id} className={`brg-row ${phone ? 'm' : ''} ${active === p.id ? 'on' : ''} ${p.unread ? 'unread' : ''}`} onClick={() => onOpen(p)} title={peerTitle(p)}>
        <PeerIcon p={p} size={phone ? 46 : ICON_PX[iconSz]} />
        <span className="n"><b>{p.name}</b>{sub ? <span className="sub">· {sub}</span> : null}</span>
        {p.last ? <time>{fmtTime(p.last.at)}</time> : null}
      </button>
    })}
  </div>
}

/* ── 편지 창 (2026-10-19 Dave «A 대화처럼» · 목업 `03_디자인/2026-10-19_연결-스레드-목업` A) ──────────────
 * 메인 대화창과 같은 말투다 — 카드 테두리 없이 흐린 메타 한 줄 · 굵은 제목 · 마크다운 본문.
 *  - 감시기(ops-watch) 자동 보고는 이어진 것끼리 한 줄로 접는다(이번 달 397통 중 240통이 그것이었다). 누르면 펼친다.
 *  - «사람 결정» 편지는 본문에 노란 줄 — 무엇을 정해야 하는지 본문 안에서 바로 보인다.
 *  - 내가 쓴 편지는 메인 대화의 내 말처럼 오른쪽 상자.
 *  - 편지 파일 이름·커서·trust 같은 개발자 말은 화면에서 뺐다(마우스를 올리면 보인다).
 * 오른쪽 칸(`BridgeSide`)은 이 상대에 맞춘 것만 — 채널 세션 · 편지함(보기 거름·수) · 연결 정보. 문서·파일 트리는 없다(Dave «필요없는 문서나 폴더 섹션»).
 * 스레드와 오른쪽 칸은 같은 편지 목록(`useThread`)을 본다 — 요청도 하나.
 */
type Thread = { peer: PeerView; letters: LetterView[] }
export type ThreadFilter = 'all' | 'talk' | 'need'
const threads = new Map<string, Thread>()
const tErr = new Map<string, string>()
const tFlight = new Map<string, Promise<void>>()
const tSubs = new Set<() => void>()
let tFilter: ThreadFilter = 'all'
const tPing = () => tSubs.forEach((f) => f())
function loadThread(id: string): Promise<void> {
  const f = tFlight.get(id)
  if (f) return f
  const p = api<Thread>(`/bridges/${id}/letters`).then((r) => {
    if (r.peer.id !== id) return   // 늦게 온 다른 상대의 답은 버린다(A 의 편지 위에서 B 에게 쓰는 일이 없게)
    threads.set(id, r); tErr.delete(id); tPing()
    if (r.peer.unread && document.visibilityState === 'visible') void api(`/bridges/${id}/seen`, { body: {} }).then(() => loadBridges()).catch(() => {})
  }).catch((e) => { tErr.set(id, (e as Error).message); tPing() }).finally(() => tFlight.delete(id))
  tFlight.set(id, p)
  return p
}
const setThreadFilter = (f: ThreadFilter) => { tFilter = f; tPing() }
function useThread(peerId: string) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  useEffect(() => { tSubs.add(force); return () => { tSubs.delete(force) } }, [])
  return { t: threads.get(peerId) ?? null, err: tErr.get(peerId) ?? '', filter: tFilter }
}

/** 사람 말 — report·request 같은 낱말을 화면에 두지 않는다 */
const KIND_KO: Record<string, string> = { request: '확인 요청', reply: '답장', report: '보고', done: '끝남', incident: '장애', briefing: '브리핑', heartbeat: '신호' }
const TRUST_KO: Record<Trust, string> = { read: '읽고 답장만', propose: '읽고 답하고 봇에게 나눠 주기', act: '제한 없음' }
/** 감시기 자동 보고 — 접어서 한 줄로 */
export const isMachine = (l: Pick<LetterView, 'from' | 'kind'>) => l.from === 'ops-watch' || l.kind === 'heartbeat'
const hhmm = (t: number) => { const d = new Date(t), now = new Date(); const tm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); return d.toDateString() === now.toDateString() ? tm : `${d.getMonth() + 1}/${d.getDate()} ${tm}` }
const tmOnly = (t: number) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
const dayLabel = (t: number) => new Date(t).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })
const dayKey = (t: number) => new Date(t).toDateString()
/** 접은 줄 글 — 감시기 편지 제목 «📤 폴더 봇 보고 N건» 의 N 을 더한다. 다른 꼴이 섞이면 통 수로 */
const foldText = (ls: LetterView[]) => {
  const ns = ls.map((l) => Number(/보고\s*(\d+)\s*건/.exec(l.title ?? '')?.[1] ?? NaN))
  return ns.every((n) => n > 0) ? `감시기가 폴더 봇 보고 ${ns.reduce((a, b) => a + b, 0)}건을 넘겼어요` : `감시기 편지 ${ls.length}통`
}
type Entry = { k: 'day'; key: string; at: number } | { k: 'l'; l: LetterView } | { k: 'fold'; key: string; ls: LetterView[] }
/** 날 줄 · 편지 · 접은 감시기 줄 — 거름(`filter`)을 먼저 걸고 이어진 감시기 편지끼리 묶는다(날을 넘으면 끊는다) */
export function threadEntries(letters: LetterView[], filter: ThreadFilter): Entry[] {
  const ls = [...letters].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .filter((l) => (filter === 'need' ? l.needsHuman : filter === 'talk' ? !isMachine(l) : true))
  const out: Entry[] = []
  let day = ''
  for (const l of ls) {
    const dk = dayKey(l.at)
    if (dk !== day) { day = dk; out.push({ k: 'day', key: dk, at: l.at }) }
    const last = out[out.length - 1]
    if (isMachine(l)) { if (last?.k === 'fold') last.ls.push(l); else out.push({ k: 'fold', key: l.id, ls: [l] }); continue }
    out.push({ k: 'l', l })
  }
  return out
}

/** 편지 창 — 가운데 칸. 사람이 창을 열면 «안 읽음» 을 걷는다 */
export function BridgeThread({ peerId, go, say, phone, onBack, onSide }: { peerId: string; go: (botId: string, sid?: string) => void; say: (m: string) => void; phone?: boolean; onBack?: () => void; onSide?: () => void }) {
  const { s } = useStore()
  const { t, err, filter } = useThread(peerId)
  const scRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => {
    setOpen(new Set()); setThreadFilter('all'); void loadThread(peerId)
    void api(`/bridges/${peerId}/seen`, { body: {} }).then(() => loadBridges()).catch(() => {})
    const f = () => void loadThread(peerId)
    window.addEventListener('fb:bridges', f)
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void loadThread(peerId) }, 30_000)
    return () => { window.removeEventListener('fb:bridges', f); window.clearInterval(iv) }
  }, [peerId])
  const n = t?.letters.length ?? 0
  useEffect(() => { const el = scRef.current; if (el) el.scrollTop = el.scrollHeight }, [n, peerId, filter])
  const bot = (id: string) => s.bots.find((x) => x.id === id || x.name === id)
  const botName = (id: string) => { const b = bot(id); return b ? (b.displayName || b.name) : id }
  // ── 쓰기 ──
  const [text, setText] = useState('')
  const [kind, setKind] = useState('report')
  const [urgent, setUrgent] = useState(false)
  const [human, setHuman] = useState(false)
  const [re, setRe] = useState<LetterView | null>(null)
  const [busy, setBusy] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { setText(''); setKind('report'); setUrgent(false); setHuman(false); setRe(null) }, [peerId])
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      await api<{ id: string }>(`/bridges/${peerId}/letters`, { body: { kind: re ? 'reply' : kind, text, ...(re ? { re: re.id } : {}), urgent, needsHuman: human } })
      setText(''); setRe(null); setUrgent(false); setHuman(false); say(`${t?.peer.name ?? '상대'}에게 편지를 보냈어요`); await loadThread(peerId); void loadBridges()
    } catch (e) { say(`못 보냈어요 — ${(e as Error).message}`) } finally { setBusy(false) }
  }
  const entries = useMemo(() => threadEntries(t?.letters ?? [], filter), [t, filter])
  const byId = useMemo(() => new Map((t?.letters ?? []).map((l) => [l.id, l])), [t])
  const back = phone && onBack ? <button className="rb glassb" onClick={onBack} title="목록"><Icon n="list" size={20} /></button> : null
  if (!t) return <div className="col chat brg-thread"><div className="hdr">{back}<span className="ttl">연결</span></div><div className="empty" style={{ flex: 1 }}>{err ? `편지를 못 읽었어요 — ${err}` : '편지를 읽는 중…'}</div></div>
  const p = t.peer
  const status = (l: LetterView) => l.dir === 'in'
    ? (l.delivered ? `채널 세션에 들어감 ${tmOnly(l.delivered)}` : l.baseline ? '처음 켤 때 있던 편지라 세션에 넣지 않았어요' : p.owner ? '세션에 넣는 중…' : p.host ? `${p.host} 가 받아요` : '아직 안 들어감')
    : `${l.wake ? (l.wake.ok ? '깨우기 보냄 · ' : '깨우기 실패 · ') : ''}${l.readAt ? `${p.name} 읽음 ${tmOnly(l.readAt)}` : '아직 안 읽음'}`
  const reLine = (l: LetterView) => { if (!l.re) return ''; const r = byId.get(l.re); return r?.title ? `«${r.title}»에 대한 답` : '앞 편지에 대한 답' }
  const tip = (l: LetterView) => `${l.rel}${l.re ? `\n↩ ${l.re}` : ''}`
  const letter = (l: LetterView, dim?: boolean) => {
    // 내가 쓴 편지 — 메인 대화의 내 말처럼 오른쪽 상자
    if (l.dir === 'out' && l.from === HUMAN) return <div key={`${l.dir}-${l.id}`} className="brg-letter out me" data-id={l.id} title={tip(l)}>
      <div className="umsg"><Md text={l.title ? `**${l.title}**\n\n${l.body}` : l.body} user /></div>
      <div className="umeta">나 → {p.name} · {KIND_KO[l.kind] ?? l.kind}{l.urgent ? ' · 급함' : ''}{l.needsHuman ? ' · 결정 필요' : ''} · {hhmm(l.at)} · {status(l)}</div>
    </div>
    const b = l.dir === 'in' ? null : bot(l.from.replace(/^folderbot:/, ''))
    const who = l.dir === 'in' ? p.name : isMachine(l) ? '감시기' : b ? (b.displayName || b.name) : l.from
    const to = l.dir === 'in' ? botName(l.to || p.deliverBot) : p.name
    const dot = l.dir === 'in' ? p.color : b?.color ?? 'var(--t3)'
    const foot = [reLine(l), status(l)].filter(Boolean).join(' · ')
    return <div key={`${l.dir}-${l.id}`} className={`brg-letter ${l.dir} ${l.needsHuman ? 'need' : ''} ${dim ? 'dim' : ''}`} data-id={l.id}>
      <div className="meta"><span className="dt" style={{ background: dot }} /><span className="who">{who}</span><span className="to">→ {to}</span><span>· {KIND_KO[l.kind] ?? l.kind} · {hhmm(l.at)}</span>
        {l.urgent ? <span className="tg u">급함</span> : null}{l.needsHuman ? <span className="tg e">정할 것</span> : null}
        {l.dir === 'in' ? <button className="brg-re" onClick={() => { setRe(l); taRef.current?.focus() }} title="이 편지에 답장">답장</button> : null}</div>
      {l.title ? <div className="ttl2">{l.title}</div> : null}
      <div className="lbody"><Md text={l.body} user />{l.cut ? <div className="cut">…앞부분만 실었어요</div> : null}</div>
      <div className="src" title={tip(l)}>{foot}</div>
    </div>
  }
  return <div className="col chat brg-thread" data-peer={p.id}>
    <div className="hdr brg-head">
      {back}
      {/* 메인 대화 머리줄(`chat-hdr`)과 같은 줄 — 작은 흑백 얼굴 · 이름 · 흐린 보조 글 */}
      <PeerIcon p={p} size={16} />
      <span className="ttl" title={peerTitle(p)}>{p.name}</span>
      <span className="brg-meta" title={peerTitle(p)}>{peerLine(p)}</span>
      <span className="sp" />
      {filter !== 'all' ? <button className="brg-fpill" onClick={() => setThreadFilter('all')} title="모두 보기로">{filter === 'need' ? '정할 것만' : '주고받은 말만'} <Icon n="x" size={10} /></button> : null}
      {p.channelSid && !onSide ? <button className="btn ghost" onClick={() => go(p.deliverBot, p.channelSid)}>채널 세션</button> : null}
      {onSide ? <button className="ib" onClick={onSide} title="세션 · 편지함"><Icon n="panelr" size={phone ? 18 : 14} /></button> : null}
    </div>
    <div className="brg-letters" ref={scRef}>
      <div className="brg-col">
        {!entries.length ? <div className="brg-none">{filter === 'need' ? '정할 것이 붙은 편지가 없어요.' : filter === 'talk' ? '감시기 보고 말고는 오간 편지가 없어요.' : `이번 달과 지난달에 오간 편지가 없어요. ${p.name}가 편지를 쓰면 여기 보여요.`}</div> : null}
        {entries.map((e) => e.k === 'day' ? <div key={`d-${e.key}`} className="brg-day">{dayLabel(e.at)}</div>
          : e.k === 'l' ? letter(e.l)
          : <div key={`f-${e.key}`} className={`brg-fold ${open.has(e.key) ? 'open' : ''}`}>
            <button className="fh" onClick={() => setOpen((o) => { const x = new Set(o); if (x.has(e.key)) x.delete(e.key); else x.add(e.key); return x })} aria-expanded={open.has(e.key)}>
              <Icon n={open.has(e.key) ? 'chevd' : 'chev'} size={9} /><span className="c">{foldText(e.ls)}</span><span>· {e.ls.length > 1 ? `${e.ls.length}통 · ${tmOnly(e.ls[0].at)}–${tmOnly(e.ls[e.ls.length - 1].at)}` : tmOnly(e.ls[0].at)}</span>
            </button>
            {open.has(e.key) ? <div className="fb-in">{e.ls.map((l) => letter(l, true))}</div> : null}
          </div>)}
      </div>
    </div>
    <div className="brg-comp">
      {re ? <div className="brg-reline">↩ <b>{re.title || '이 편지'}</b>에 답장<button className="ib" onClick={() => setRe(null)} title="답장 풀기"><Icon n="x" size={11} /></button></div> : null}
      <textarea ref={taRef} value={text} rows={2} placeholder={`${p.name}에게 편지…`} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
      <div className="row">
        {re ? <span className="brg-kind fixed">답장</span>
          : <select className="brg-kind" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="편지 종류" title="편지 종류">{(['report', 'request', 'done', 'incident'] as const).map((k) => <option key={k} value={k}>{KIND_KO[k]}</option>)}</select>}
        <button className={`tg ${urgent ? 'on' : ''}`} aria-pressed={urgent} onClick={() => setUrgent(!urgent)} title={p.wake ? '급함 — 상대 웹훅도 불러 바로 깨운다' : '급함'}>⚡ 급함</button>
        <button className={`tg ${human ? 'on' : ''}`} aria-pressed={human} onClick={() => setHuman(!human)} title="상대가 사람에게 물어봐야 하는 편지">✋ 결정 필요</button>
        <span className="sp" />
        <button className={`sendb brg-send ${text.trim() && !busy ? '' : 'off'}`} disabled={!text.trim() || busy} onClick={() => void send()} title="보내기 (⌘↵)" aria-label="보내기"><Icon n="up" size={phone ? 16 : 12} /></button>
      </div>
    </div>
  </div>
}

/** 편지 창의 오른쪽 칸 — 세션 · 편지함 · 연결. 넓은 화면은 패널 자리, 좁은 화면은 오른쪽 서랍 */
export function BridgeSide({ peerId, go, phone, onBack, onCollapse }: { peerId: string; go: (botId: string, sid?: string) => void; phone?: boolean; onBack?: () => void; onCollapse?: () => void }) {
  const { s } = useStore()
  const { t, filter } = useThread(peerId)
  const b = useBridges()
  const p = t?.peer ?? b?.peers.find((x) => x.id === peerId)
  const [sec, setSec] = useState({ sess: true, box: true, info: true })
  const tog = (k: keyof typeof sec) => setSec((o) => ({ ...o, [k]: !o[k] }))
  if (!p) return <div className="col side panel brg-side"><div className="hdr"><span className="ttl">편지함</span></div></div>
  const ls = t?.letters ?? []
  const inN = ls.filter((l) => l.dir === 'in').length, outN = ls.length - inN
  const machineN = ls.filter(isMachine).length, needN = ls.filter((l) => l.needsHuman).length
  const unreadOut = ls.filter((l) => l.dir === 'out' && !l.readAt).length
  const lastRead = ls.filter((l) => l.readAt).reduce((m, l) => Math.max(m, l.readAt ?? 0), 0)
  const deliver = s.bots.find((x) => x.id === p.deliverBot)
  const sess = (s.sessionsByBot[p.deliverBot] ?? []).filter((x) => x.channel === p.id).sort((a, b2) => b2.lastActivity - a.lastActivity)
  const fRow = (f: ThreadFilter, label: string, n: number, hint: string) => <button key={f} className={`srow brg-frow ${filter === f ? 'on' : ''}`} onClick={() => setThreadFilter(f)} title={hint} aria-pressed={filter === f}>
    <span className={`dot ${f === 'need' && n ? 'wait' : 'none'}`} /><span className="n">{label}</span><span className="m">{n}</span></button>
  return <div className="col side panel brg-side" data-peer={p.id}>
    <div className="hdr">{phone && onBack ? <button className="rb glassb" onClick={onBack} title="편지로"><Icon n="back" size={20} /></button> : null}<span className="ttl">편지함</span><span className="sp" />{!phone && onCollapse ? <div className="acts"><button className="ib on" onClick={onCollapse} title="패널 접기 (⌘⇧B)"><Icon n="panelr" size={14} /></button></div> : null}</div>
    <div className="sec fix">
      <button className="sech" onClick={() => tog('sess')}><Icon n={sec.sess ? 'chevd' : 'chev'} size={9} /><span>채널 세션</span><span className="c">{sess.length}</span></button>
      {sec.sess ? <div className="secb" style={{ padding: '0 0 6px' }}>
        {sess.map((x) => <button key={x.id} className="srow" onClick={() => go(p.deliverBot, x.id)} title="이 세션으로 — 편지를 받아 처리한 생각·도구 줄이 여기 있어요">
          <span className={`dot ${x.state === 'running' ? 'run' : x.state === 'awaiting_input' ? 'wait' : x.state === 'error' ? 'err' : 'none'}`} /><span className="n">{x.name}</span><span className="m">{fmtTime(x.lastActivity)}</span></button>)}
        <div className="brg-hint">{sess.length ? `${p.name}의 편지는 ${deliver ? (deliver.displayName || deliver.name) : p.deliverBot}의 이 세션에 들어가요.` : `${p.name}가 편지를 쓰면 ${deliver ? (deliver.displayName || deliver.name) : p.deliverBot}에 채널 세션이 생겨요.`}</div>
      </div> : null}
    </div>
    <div className="divy" style={{ cursor: 'default' }} />
    <div className="sec fix">
      <button className="sech" onClick={() => tog('box')}><Icon n={sec.box ? 'chevd' : 'chev'} size={9} /><span>편지</span><span className="c">{ls.length}</span></button>
      {sec.box ? <div className="secb" style={{ padding: '0 0 6px' }}>
        {fRow('all', '모두', ls.length, '감시기 보고는 한 줄로 접어서')}
        {fRow('talk', '주고받은 말만', ls.length - machineN, '감시기 자동 보고를 빼고')}
        {fRow('need', '정할 것', needN, '«사람 결정» 이 붙은 편지만')}
        <div className="brg-kv"><span>받은 편지</span><b>{inN}통</b></div>
        <div className="brg-kv"><span>보낸 편지</span><b>{outN}통{unreadOut ? ` · 안 읽음 ${unreadOut}` : ''}</b></div>
        <div className="brg-kv"><span>{p.name}가 읽은 때</span><b>{lastRead ? hhmm(lastRead) : '아직'}</b></div>
      </div> : null}
    </div>
    <div className="divy" style={{ cursor: 'default' }} />
    <div className="sec grow">
      <button className="sech" onClick={() => tog('info')}><Icon n={sec.info ? 'chevd' : 'chev'} size={9} /><span>연결</span></button>
      {sec.info ? <div className="secb" style={{ padding: '0 0 6px' }}>
        <div className="brg-kv"><span>상태</span><b className={p.stale ? 'bad' : ''}>{peerLine(p)}</b></div>
        <div className="brg-kv"><span>할 수 있는 일</span><b>{TRUST_KO[p.trust]}</b></div>
        <div className="brg-kv"><span>받는 맥</span><b>{p.host ? (p.owner ? `${p.host} (이 맥)` : p.host) : '이 맥'}</b></div>
        <div className="brg-kv"><span>급할 때 깨우기</span><b>{p.wake ? '켬' : '없음'}</b></div>
        <div className="brg-kv col"><span>우편함</span><b className="mono" title={p.mailbox}>{p.mailbox}</b></div>
        <button className="srow sadd" onClick={() => window.dispatchEvent(new CustomEvent('fb:settings', { detail: 'bridges' }))}><Icon n="gear" size={11} color="var(--t3)" /><span className="n">설정 › 연결에서 바꾸기</span></button>
      </div> : null}
    </div>
  </div>
}

/* ── 설정 › 연결 ─────────────────────────────────────────────────────────── */

/** 줄 하나 — 설정의 `Row` 와 같은 꼴(제목 · 설명 · 조작). ⚠ 설정 검색 인덱스 검사가 이 파일의 `<Row t=…>` 도 읽는다 */
function Row({ t, d, children }: { t: string; d?: ReactNode; children?: ReactNode }) {
  return <div className="setr" data-t={t}><span className="tx"><span className="t">{t}<span className="scp at-main" title="호스트에 저장 — 모든 기기에 같이 보여요">메인</span></span>{d ? <span className="d">{d}</span> : null}</span>{children ? <span className="c">{children}</span> : null}</div>
}
const TRUST_T: Record<Trust, string> = { read: '읽고 답장만', propose: '읽고 답하고 봇에게 나눠 주기까지(추천)', act: '제한 없음 — 믿는 상대만' }

export function BridgesPane() {
  const b = useBridges()
  const [wiz, setWiz] = useState(false)
  if (wiz) return <BridgeWizard onDone={() => setWiz(false)} />
  return <>
    <Row t="지금 연결" d={b?.peers.length ? '레일의 «연결» 절에도 보여요. 누르면 편지 스레드가 열려요' : '아직 연결이 없어요 — 바깥 에이전트(클라우드 비서·스크립트·자동화)와 편지 파일로 대화하는 길이에요'} />
    {b?.peers.map((p) => <div className="brg-prow" key={p.id} data-peer={p.id}><PeerIcon p={p} size={24} /><span className="n"><b>{p.name}</b><small>{p.mailbox} · trust {p.trust}{p.host ? ` · ${p.host}` : ''}</small></span>{p.stale ? <span className="pill e">끊김</span> : null}</div>)}
    {b?.errors.length ? <div className="brg-err">⚠ .claude/bridges.yml — {b.errors.join(' · ')}</div> : null}
    <Row t="새 연결 만들기" d="세 단계 — 상대 종류 → 우편함 자리·권한 → 만들기. 우편함 폴더와 README 를 만들고, 상대에게 줄 한 줄을 알려 드려요"><button className="btn on" onClick={() => setWiz(true)}>만들기</button></Row>
  </>
}

interface Made { mailbox: string; created: string[]; readme: string; readmeKept: boolean; configFile: string; line: string }
function BridgeWizard({ onDone }: { onDone: () => void }) {
  const { s } = useStore()
  const b = useBridges()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [preset, setPreset] = useState<PresetId>('grok-bot')
  const ps = presetOf(preset)
  const [name, setName] = useState(ps.name)
  const [id, setId] = useState('')
  const [icon, setIcon] = useState(ps.icon)
  const [mailbox, setMailbox] = useState('')
  const [mbTouched, setMbTouched] = useState(false)
  const [bot, setBot] = useState('orch')
  const [trust, setTrust] = useState<Trust>('propose')
  const [every, setEvery] = useState(ps.expectEvery ?? '')
  const [wake, setWake] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<Made | null>(null)
  const taken = b?.taken ?? { ids: [], mailboxes: [] }
  /** 종류를 고르면 그 종류의 기본값으로 다시 채운다 */
  const pick = (id2: PresetId) => { const p = presetOf(id2); setPreset(id2); setName(p.name); setIcon(p.icon); setEvery(p.expectEvery ?? ''); setWake(false); setId(freeId(p.peerId, taken.ids)); setMbTouched(false) }
  useEffect(() => { if (!id) setId(freeId(ps.peerId, taken.ids)) }, [b])
  const mb = mbTouched ? mailbox : defaultMailbox(s.rules, name)
  const input = { preset, id, name, icon, mailbox: mb, deliverBot: bot, trust, ...(every ? { expectEvery: every } : {}), inbound: ps.inbound, wake }
  const problems = useMemo(() => newBridgeProblems(input, taken), [preset, id, name, icon, mb, bot, trust, every, wake, b])
  const create = async () => {
    setBusy(true); setErr('')
    try { const r = await api<Made>('/bridges', { body: input }); setDone(r); setStep(3); void loadBridges() }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const say = (m: string) => setErr(m)
  const head = <div className="brg-step">{(['① 종류', '② 자리·권한', '③ 만들기'] as const).map((x, i) => <span key={x} className={step === i + 1 ? 'on' : ''}>{x}{i < 2 ? ' ›' : ''}</span>)}</div>
  const bots = s.bots
  return <div className="brg-wiz" data-step={step}>
    {head}
    {step === 1 ? <>
      {PRESETS.map((p) => <button key={p.id} data-preset={p.id} className={`brg-card ${preset === p.id ? 'on' : ''}`} onClick={() => pick(p.id)}><b><FolderBot shape="bubble" color={peerColor(p.peerId)} size={18} />{p.title}</b><span className="s">{p.sub}</span></button>)}
      <div className="brg-btns"><button className="btn ghost" onClick={onDone}>취소</button><button className="btn on" onClick={() => { if (!id) setId(freeId(ps.peerId, taken.ids)); setStep(2) }}>다음</button></div>
    </> : null}
    {step === 2 ? <>
      <div className="brg-fields">
        <label>이름<input value={name} onChange={(e) => setName(e.target.value)} placeholder="할일이" /></label>
        <label className="sm">아이콘<input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} /></label>
        <label className="sm">id <small>영문 · 편지 파일 이름에</small><input className="mono" value={id} onChange={(e) => setId(e.target.value.toLowerCase())} /></label>
      </div>
      <label className="brg-f">우편함 폴더 <small>볼트 기준 · 없으면 만들어요</small><input className="mono" value={mb} onChange={(e) => { setMailbox(e.target.value); setMbTouched(true) }} /></label>
      <label className="brg-f">편지를 받을 봇<select value={bot} onChange={(e) => setBot(e.target.value)}>{bots.map((x) => <option key={x.id} value={x.id}>{x.displayName || x.name}{x.orchestrator ? ' (관제)' : ''}</option>)}</select></label>
      <div className="brg-f">신뢰 수준<div className="seg">{(['read', 'propose', 'act'] as Trust[]).map((x) => <button key={x} className={trust === x ? 'on' : ''} onClick={() => setTrust(x)}>{x}</button>)}</div><small>{TRUST_T[trust]} · 어느 수준이든 편지가 시작한 턴에서는 폴더 생성·이동·은퇴를 못 해요</small></div>
      {preset === 'grok-bot' ? <label className="brg-f">끊김 감지 <small>이만큼 상대 커서가 안 바뀌면 «끊김»</small><input className="mono" value={every} onChange={(e) => setEvery(e.target.value)} placeholder="150m" /></label> : null}
      {preset !== 'generic-file' ? <label className="brg-chk"><input type="checkbox" checked={wake} onChange={(e) => setWake(e.target.checked)} />급한 편지에 상대 깨우기(웹훅) <small>주소·키는 ~/.config/secrets/folderbot-bridge-{id || '<id>'}.env 에 직접 둬요</small></label> : null}
      {preset === 'webhook' ? <div className="brg-note">들어오는 웹훅을 켜요 — 토큰은 호스트 맥의 <span className="mono">~/.config/secrets/folderbot-bridge-{id || '<id>'}-in.env</span> 에 <span className="mono">TOKEN=…</span>(16자 이상 · 0600)으로 직접 만들어요. 같은 tailnet 에서만 받아요.</div> : null}
      {problems.length ? <div className="brg-err">{problems.join(' · ')}</div> : null}
      {err ? <div className="brg-err">{err}</div> : null}
      <div className="brg-btns"><button className="btn ghost" onClick={() => setStep(1)}>이전</button><button className="btn on" disabled={!!problems.length || busy} onClick={() => void create()}>{busy ? '만드는 중…' : '만들기'}</button></div>
    </> : null}
    {step === 3 && done ? <>
      <div className="brg-f">상대에게 이 한 줄을 주세요<div className="brg-copy mono">{done.line}</div></div>
      <div className="brg-note">만들었어요 — 우편함 폴더 {done.created.length || 0}개{done.readmeKept ? ' · README 는 이미 있던 것을 그대로 뒀어요' : ' · README(FBMF v1 + 이 상대용 예시)'} · {done.configFile} 에 한 줄</div>
      {err ? <div className="brg-err">{err}</div> : null}
      <div className="brg-btns"><button className="btn ghost" onClick={() => void copySay(done.line, say, '복사했어요 — 상대에게 붙여 넣으세요')}><Icon n="copy" size={12} /> 한 줄 복사</button><button className="btn on" onClick={onDone}>닫기</button></div>
    </> : null}
  </div>
}

