import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import type { LetterView, PeerView, PresetId } from '../core/bridgeView'
import { PRESETS, agoText, defaultMailbox, freeId, newBridgeProblems, peerTint, presetOf } from '../core/bridgeView'
import type { Trust } from '../core/bridges'
import { api } from './api'
import { copySay } from './clip'
import { Icon } from './FolderBot'
import { useStore } from './store'

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

/** 상대 아이콘 — 어두운 칸에 이모지. 상태 점은 오른쪽 아래(상태 배지 자리 · 리포 금기) */
function PeerIcon({ p, size = 24 }: { p: PeerView; size?: number }) {
  return <span className="brg-ico" style={{ background: peerTint(p.id), width: size, height: Math.round(size * 0.84), fontSize: Math.round(size * 0.55) }}>{p.icon}<span className={`dot ${p.stale ? 'err' : p.owner ? 'done' : 'none'}`} /></span>
}

/** 레일 «연결» 절 — 상대가 없으면 절 자체를 안 그린다 */
export function BridgeRail({ active, onOpen, phone }: { active?: string; onOpen: (p: PeerView) => void; phone?: boolean }) {
  const b = useBridges()
  if (!b?.peers.length) return null
  return <div className="brg-sec" data-sec="연결">
    <div className="secl">연결</div>
    {b.peers.map((p) => {
      const sub = p.stale ? `끊김 ${p.lastSignal ? agoText(p.lastSignal) : ''}`.trim() : p.unread ? `편지 ${p.unread}` : !p.owner && p.host ? `${p.host} 가 받음` : ''
      return <button key={p.id} data-peer={p.id} className={`brg-row ${phone ? 'm' : ''} ${active === p.id ? 'on' : ''} ${p.unread ? 'unread' : ''}`} onClick={() => onOpen(p)}
        title={`${p.name} · 우편함 ${p.mailbox} · trust ${p.trust}${p.lastSignal ? ` · 마지막 신호 ${agoText(p.lastSignal)} 전` : ''}`}>
        <PeerIcon p={p} size={phone ? 40 : 24} />
        <span className="n"><b>{p.name}</b>{sub ? <span className="sub">· {sub}</span> : null}</span>
        {p.stale ? <span className="pill e" title="상대 신호가 끊겼어요">!</span> : p.unread ? <span className="pill u">{p.unread}</span> : null}
      </button>
    })}
  </div>
}

const KIND_T: Record<string, string> = { request: 'request', reply: 'reply', report: 'report', done: 'done', incident: 'incident', briefing: 'briefing', heartbeat: 'heartbeat' }
const hhmm = (t: number) => { const d = new Date(t), now = new Date(); const tm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }); return d.toDateString() === now.toDateString() ? tm : `${d.getMonth() + 1}/${d.getDate()} ${tm}` }

/** 편지 스레드 — 가운데 칸. 사람이 스레드를 열면 «안 읽음» 을 걷는다 */
export function BridgeThread({ peerId, go, say, phone, onBack }: { peerId: string; go: (botId: string, sid?: string) => void; say: (m: string) => void; phone?: boolean; onBack?: () => void }) {
  const { s } = useStore()
  const [t, setT] = useState<{ peer: PeerView; letters: LetterView[] } | null>(null)
  const [err, setErr] = useState('')
  const scRef = useRef<HTMLDivElement>(null)
  /** 지금 보고 있는 상대 — 늦게 온 다른 상대의 답을 버린다(A 의 편지 위에서 B 에게 쓰는 일이 없게 · 2026-10-19 검토) */
  const cur = useRef(peerId); cur.current = peerId
  const load = async () => {
    const want = peerId
    try {
      const r = await api<{ peer: PeerView; letters: LetterView[] }>(`/bridges/${want}/letters`)
      if (cur.current !== want || r.peer.id !== want) return
      setT(r); setErr('')
      if (r.peer.unread && document.visibilityState === 'visible') void api(`/bridges/${want}/seen`, { body: {} }).then(() => loadBridges()).catch(() => {})
    } catch (e) { if (cur.current === want) setErr((e as Error).message) }
  }
  useEffect(() => {
    setT(null); void load()
    void api(`/bridges/${peerId}/seen`, { body: {} }).then(() => loadBridges()).catch(() => {})
    const f = () => void load()
    window.addEventListener('fb:bridges', f)
    const iv = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    return () => { window.removeEventListener('fb:bridges', f); window.clearInterval(iv) }
  }, [peerId])
  const n = t?.letters.length ?? 0
  useEffect(() => { const el = scRef.current; if (el) el.scrollTop = el.scrollHeight }, [n, peerId])
  const botName = (id: string) => { const b = s.bots.find((x) => x.id === id || x.name === id); return b ? (b.displayName || b.name) : id }
  const fromName = (l: LetterView, p: PeerView) => (l.dir === 'in' ? p.name : l.from === 'human' ? '나' : botName(l.from.replace(/^folderbot:/, '')))
  // ── 쓰기 ──
  const [text, setText] = useState('')
  const [kind, setKind] = useState('report')
  const [urgent, setUrgent] = useState(false)
  const [human, setHuman] = useState(false)
  const [re, setRe] = useState<LetterView | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setText(''); setKind('report'); setUrgent(false); setHuman(false); setRe(null) }, [peerId])
  const send = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try {
      const r = await api<{ id: string }>(`/bridges/${peerId}/letters`, { body: { kind: re ? 'reply' : kind, text, ...(re ? { re: re.id } : {}), urgent, needsHuman: human } })
      setText(''); setRe(null); setUrgent(false); setHuman(false); say(`편지를 보냈어요 · ${r.id}`); await load(); void loadBridges()
    } catch (e) { say(`못 보냈어요 — ${(e as Error).message}`) } finally { setBusy(false) }
  }
  if (!t || t.peer.id !== peerId) return <div className="col chat brg-thread"><div className="hdr">{phone && onBack ? <button className="rb glassb" onClick={onBack}><Icon n="list" size={20} /></button> : null}<span className="ttl">연결</span></div><div className="empty" style={{ flex: 1 }}>{err ? `스레드를 못 읽었어요 — ${err}` : '편지를 읽는 중…'}</div></div>
  const p = t.peer
  return <div className="col chat brg-thread" data-peer={p.id}>
    <div className="hdr brg-head">
      {phone && onBack ? <button className="rb glassb" onClick={onBack} title="목록"><Icon n="list" size={20} /></button> : null}
      <PeerIcon p={p} size={22} />
      <b className="ttl">{p.name}</b>
      <span className="brg-meta">· trust {p.trust}{p.lastSignal ? ` · 마지막 신호 ${agoText(p.lastSignal)}${agoText(p.lastSignal) === '방금' ? '' : ' 전'}(커서)` : ' · 아직 신호 없음'}{p.stale ? ' · 끊김' : ''} · 우편함 {p.mailbox}</span>
      <span className="sp" />
      {p.channelSid ? <button className="btn ghost" onClick={() => go(p.deliverBot, p.channelSid)}>채널 세션 열기</button> : null}
    </div>
    <div className="brg-letters" ref={scRef}>
      {!t.letters.length ? <div className="brg-none">이번 달과 지난달에 오간 편지가 없어요. 상대가 <span className="mono">to-folderbot/</span> 에 쓰면 여기 보여요.</div> : null}
      {t.letters.map((l) => <div key={`${l.dir}-${l.id}`} className={`brg-letter ${l.dir}`} data-id={l.id}>
        <div className="lh"><b>{fromName(l, p)}</b><span className={`k ${l.kind === 'incident' ? 'inc' : l.kind === 'request' ? 'req' : l.kind === 'reply' || l.kind === 'done' ? 'rep' : ''}`}>{KIND_T[l.kind] ?? l.kind}</span><span>{hhmm(l.at)}</span>{l.urgent ? <span className="pill u">급함</span> : null}{l.needsHuman ? <span className="pill e">사람 결정</span> : null}
          {l.dir === 'in' ? <button className="brg-re" onClick={() => setRe(l)} title="이 편지에 답장">답장</button> : null}</div>
        <div className="lbody">{l.title ? <b className="lt">{l.title}</b> : null}{l.body}{l.cut ? <span className="cut"> …(앞만 실었어요 — {l.rel})</span> : null}</div>
        <div className="lfoot">{l.dir === 'in'
          ? <>{l.delivered ? `✓ 채널 세션에 들어감 ${hhmm(l.delivered)}` : l.baseline ? '처음 켤 때 있던 편지 — 넣지 않음' : p.owner ? '들어가는 중…' : p.host ? `${p.host} 호스트가 받아요` : '아직 안 들어감'} · {l.id}</>
          : <>{l.re ? `↩ re ${l.re} · ` : ''}{l.wake ? `깨우기 웹훅 ${l.wake.status ?? (l.wake.ok ? 'ok' : '실패')} · ` : ''}{l.readAt ? `${p.name} 읽음 ${hhmm(l.readAt)}(커서)` : '아직 안 읽음'}</>}</div>
      </div>)}
    </div>
    <div className="brg-comp">
      {re ? <div className="brg-reline">↩ <b>{re.title || re.id}</b> 에 답장<button className="ib" onClick={() => setRe(null)} title="답장 풀기"><Icon n="x" size={11} /></button></div> : null}
      <textarea value={text} rows={2} placeholder={`${p.name}에게 편지 쓰기…`} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) { e.preventDefault(); void send() } }} />
      <div className="row">
        {re ? <span className="chip on">reply</span> : (['report', 'request', 'done', 'incident'] as const).map((k) => <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k}</button>)}
        <span className="sp" />
        <button className={`chip ${urgent ? 'on' : ''}`} onClick={() => setUrgent(!urgent)} title={p.wake ? '급함 — 상대 웹훅도 부른다' : '급함'}>급함</button>
        <button className={`chip ${human ? 'on' : ''}`} onClick={() => setHuman(!human)}>사람 결정</button>
        <button className="btn on" disabled={!text.trim() || busy} onClick={() => void send()} title="보내기 (⌘↵)">보내기</button>
      </div>
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
      {PRESETS.map((p) => <button key={p.id} data-preset={p.id} className={`brg-card ${preset === p.id ? 'on' : ''}`} onClick={() => pick(p.id)}><b>{p.icon} {p.title}</b><span className="s">{p.sub}</span></button>)}
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

